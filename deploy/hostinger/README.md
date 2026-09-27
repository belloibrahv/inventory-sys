# Running the shop system on Hostinger

Everything here is for a **Hostinger VPS** (KVM plan). Railway keeps running as
it is; nothing in this folder changes how Railway builds or starts the app.

The server runs four containers from `docker-compose.yml`:

| Container | Job |
|---|---|
| `app` | The shop system (Next.js), built from `Dockerfile` in this folder |
| `db` | Postgres 18, the same major version as Railway |
| `caddy` | HTTPS in front of the app. Gets and renews the certificate itself |
| `backup` | A full copy of the database every night, kept in `backups/` |

Only ports 80 and 443 are open to the internet. The database is never exposed.

## Which Hostinger plan

Pick a **VPS**, not shared "Cloud hosting": the app needs Postgres, a
long-running Node server, and Docker.

- **KVM 2** (2 vCPU, 8 GB RAM) is comfortable for the three shops. KVM 1 works
  but building the app on it is slow.
- Operating system: **Ubuntu 24.04 with Docker** (Hostinger's "Docker"
  template), or plain Ubuntu 24.04 and install Docker with
  `curl -fsSL https://get.docker.com | sh`.
- Choose the data centre closest to the shops that Hostinger offers.

## First-time setup

1. **Point the domain.** In your DNS, add an `A` record for the address staff
   will use (for example `shop.example.com`) to the VPS IP address. Wait until
   `ping shop.example.com` answers from that IP. Caddy cannot get the HTTPS
   certificate before this.

2. **Get the code onto the server.**

   ```sh
   ssh root@<vps-ip>
   git clone https://github.com/belloibrahv/inventory-sys.git /opt/abutwins
   cd /opt/abutwins/deploy/hostinger
   ```

3. **Fill in the settings.**

   ```sh
   cp .env.example .env
   nano .env
   ```

   - `DOMAIN` and `NEXTAUTH_URL` / `NEXT_PUBLIC_APP_URL`: the address from step 1.
   - `POSTGRES_PASSWORD`: run `openssl rand -base64 24 | tr -d '/+='` and paste it.
   - `NEXTAUTH_SECRET`: run `openssl rand -base64 32` and paste it. Use a new
     one, not Railway's; staff simply sign in again on the new address.
   - Leave `SEED_DEMO_USERS` out. It creates the demo logins.

4. **Start it.**

   ```sh
   BUILD_ID=$(git rev-parse --short HEAD) docker compose up -d --build
   docker compose ps          # app should say (healthy) within about a minute
   docker compose logs -f app # Ctrl+C to stop watching
   ```

   On a new, empty database the first lines say `Nothing to heal yet (new
   database?)`. That is expected.

5. **Check it:** open `https://<your domain>/api/health`. It should show
   `"status":"ok","database":"ok"`.

At this point the server is running with an empty shop. The next step brings
the real data across.

## Moving the data from Railway

On Railway, open the **Postgres** service, then **Variables**, and copy
`DATABASE_PUBLIC_URL`. Then on the server:

```sh
cd /opt/abutwins/deploy/hostinger
./move-from-railway.sh "postgresql://...the DATABASE_PUBLIC_URL..."
```

The script backs up this server's database, stops the app, copies Railway's
database (Railway is only read, never changed), loads it here, compares the row
counts of the main tables, and starts the app again. It ends with
`Done. Every table matches.`

**Rehearse it first.** Run it once while Railway is still the live system, sign
in on the new address, and look around. Nothing on Railway changes.

## Switching over

1. Pick a quiet time and tell the shops to stop selling for about 10 minutes.
2. Run `./move-from-railway.sh "<Railway URL>"` again, so the very last sales
   come across. Every table must match.
3. Give staff the new address. On phones, install it again from the new
   address (avatar menu, **Install app**).
4. Keep Railway running, untouched, for a week or two as a fallback. After
   that you can stop it on Railway.

If anything is wrong after the switch, the shops go back to the Railway
address. Its data is exactly as it was when you stopped selling there.

## Putting out a new version

Railway still deploys every push to `main` by itself. On Hostinger you pull
and rebuild:

```sh
cd /opt/abutwins
git pull
cd deploy/hostinger
BUILD_ID=$(git rev-parse --short HEAD) docker compose up -d --build
```

The shop is down for the few seconds it takes the new container to start.

**If the app will not start after an update**, read `docker compose logs app`.
If it says the schema change would lose data, **nothing was lost**: the
start-up refused on purpose (Railway's would have gone ahead and dropped the
data). Move that data by hand, or ask the developer, before starting again.

## Backups

- Every night the `backup` container writes `backups/abutwins-<date>.dump` and
  deletes copies older than `BACKUP_KEEP_DAYS` (14 by default).
- **A backup on the same server is not enough.** Copy the folder somewhere
  else regularly, for example from your own computer:
  `scp -r root@<vps-ip>:/opt/abutwins/deploy/hostinger/backups ./abutwins-backups`.
  Hostinger's own VPS snapshots are a good second layer too.
- To restore one (this replaces the current data):

  ```sh
  docker compose stop app
  docker compose exec -T db sh -c 'pg_restore --clean --if-exists --no-owner -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < backups/abutwins-<date>.dump
  docker compose start app
  ```

## Day-to-day commands

```sh
docker compose ps               # is everything up?
docker compose logs -f app      # what the app is saying
docker compose restart app      # restart only the app
docker compose down             # stop everything (data is kept)
```

`docker compose down -v` also **deletes the database**. Do not run it on the
real server.

## Firewall

Allow only SSH, HTTP and HTTPS:

```sh
ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw --force enable
```
