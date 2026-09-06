# Abu Twins Softskills

Shop system for Abu Twins Softskills Investment. One record for IMEI, sales, swaps, returns, customer ledgers, finance, approvals, and stock counts.

## Stack

Next.js · TypeScript · Tailwind · Prisma · SQLite (local) · Postgres (Railway) · NextAuth · TanStack Query · Recharts

## Setup

```bash
npm install
cp .env.example .env
npm run setup
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## First login

Super Admin is the only role that can grant screens, disable staff, and undo cash. Other roles only see what Super Admin ticks on **Who can see what**.

| Role | Email | Password |
| --- | --- | --- |
| Super Admin | admin@abutwins.com | admin123 |

Change this password before any live shop uses the system. Create every other login from Staff.

## Railway

The `web` service in the `abutwins-inventory-system` project builds with Nixpacks. Local stays on SQLite. Railway switches Prisma to Postgres at build, then pushes the schema and seeds staff on start.

Set these on the **web** service (do not put them in git):

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` |
| `NEXTAUTH_SECRET` | a long random string |
| `NEXTAUTH_URL` | the public Railway URL, e.g. `https://web-production-56d9b.up.railway.app` |
| `NEXT_PUBLIC_APP_URL` | same public URL |
| `NEXT_PUBLIC_APP_NAME` | `Abu Twins Softskills` |

After a deploy, Super Admin can sign in with the first-login email above. Change that password immediately.

## What this replaces

Staff used to edit old invoices to record later payments. This system posts a **customer ledger entry** instead and leaves history intact. Every phone has IMEI 1 / IMEI 2 / serial, and stock never silently crosses shops.
