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
