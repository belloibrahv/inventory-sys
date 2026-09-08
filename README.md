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

These are **test logins** for the three Ibadan shops. They are seeded on every
deploy so the shops can be exercised end to end before going live.

**Head office** (sees every shop, and can switch between them in the header)

| Role | Email | Password |
| --- | --- | --- |
| Super Admin | admin@abutwins.com | admin123 |
| CEO | ceo@abutwins.com | ceo123 |
| Auditor | auditor@abutwins.com | auditor123 |
| Accountant | accountant@abutwins.com | accountant123 |

**Iwo Road** (HQ)

| Role | Email | Password |
| --- | --- | --- |
| Branch Manager | manager@abutwins.com | manager123 |
| Vault Manager | vault@abutwins.com | vault123 |
| Cashier | cashier@abutwins.com | cashier123 |
| Sales | sales@abutwins.com | sales123 |
| Engineer | engineer@abutwins.com | engineer123 |

**Bodija**

| Role | Email | Password |
| --- | --- | --- |
| Branch Manager | bodija.manager@abutwins.com | manager123 |
| Vault Manager | bodija.vault@abutwins.com | vault123 |
| Cashier | bodija.cashier@abutwins.com | cashier123 |
| Sales | bodija.sales@abutwins.com | sales123 |
| Engineer | bodija.engineer@abutwins.com | engineer123 |

**Challenge**

| Role | Email | Password |
| --- | --- | --- |
| Branch Manager | challenge.manager@abutwins.com | manager123 |
| Vault Manager | challenge.vault@abutwins.com | vault123 |
| Cashier | challenge.cashier@abutwins.com | cashier123 |
| Sales | challenge.sales@abutwins.com | sales123 |
| Engineer | challenge.engineer@abutwins.com | engineer123 |

> These passwords are public in this repository and are for testing only.
> Before the shops trade on this system for real, delete every test login above
> and create the real staff with `npm run staff:apply`, which issues each person
> their own password and forces a change on first sign in.

## Which shop you are looking at

Shop staff only ever see their own shop's stock, sales, customers and money.
Head office roles get a shop selector in the header: **All shops together**,
or one of Iwo Road, Bodija and Challenge on its own. Picking one shop changes
what every screen reports without limiting what head office can correct.

## Railway

Production is the Railway project **inventory-sys**, deployed from this repo (`belloibrahv/inventory-sys`, branch `main`).

Local stays on SQLite. Railway switches Prisma to Postgres at build, then pushes the schema and seeds one login for every role on start.

Live URL: https://inventory-sys-production.up.railway.app

Set these on the **inventory-sys** service (do not put them in git):

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` |
| `NEXTAUTH_SECRET` | a long random string |
| `NEXTAUTH_URL` | `https://inventory-sys-production.up.railway.app` |
| `NEXT_PUBLIC_APP_URL` | same public URL |
| `NEXT_PUBLIC_APP_NAME` | `Abu Twins Softskills` |

After the first live boot, change every seeded password.

## What this replaces

Staff used to edit old invoices to record later payments. This system posts a **customer ledger entry** instead and leaves history intact. Every phone has IMEI 1 / IMEI 2 / serial, and stock never silently crosses shops.
