# AbuTwins Nexus

A multi-shop retail platform for a phone, laptop and power-accessory business.
It unifies inventory (with per-unit IMEI / serial tracking), point of sale,
customer ledgers, supplier purchasing, inter-branch transfers, repairs, swaps,
returns, finance and day-close, staff & role administration, and a
tamper-evident audit trail — across three branches, individually and combined.

## Stack

Next.js 16 (App Router, Server Actions) · TypeScript · Tailwind CSS · Prisma ORM
· SQLite (local) / PostgreSQL (production) · NextAuth (JWT) · TanStack Query ·
Recharts · Serwist (offline-capable PWA)

## Architecture at a glance

- **Server Actions are the API.** Almost all mutations and reads run as Next.js
  Server Actions (only `/api/auth` and `/api/health` are conventional routes).
  Every action authenticates with `requireUser()` and authorizes with
  `can(role, permission)` — the client UI is never trusted as the access control.
- **Multi-tenant by branch.** Staff are bound to one shop and see only that
  shop's data; head-office roles can view any shop or all shops together.
  Isolation is enforced server-side (`branchFilter`, `scopeRecord`,
  `canReachBranch`).
- **Auditability.** Privileged activity is written to a SHA-256 hash-chained
  `AuditLog` that can be integrity-checked (`verifyAuditChain`).

## Requirements

- Node.js 20+
- npm

## Local setup

```bash
npm install
cp .env.example .env          # then set a strong NEXTAUTH_SECRET (see below)
npx prisma generate
npx prisma db push            # create the SQLite schema
npm run db:seed               # branches, settings, role permissions
npm run dev                   # http://localhost:3000
```

Generate a strong secret:

```bash
openssl rand -base64 32
```

### Demo data (throwaway environments only)

To seed a full set of per-role demo logins for exercising the system end to end,
run the seed with the demo flag. **Never enable this on a real deployment.**

```bash
SEED_DEMO_USERS=true npm run db:seed
```

Provision real staff (each gets a unique password and is forced to change it on
first sign-in) with `npm run staff:apply`.

## Environment variables

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Prisma connection string (SQLite locally; PostgreSQL in production) |
| `NEXTAUTH_SECRET` | Session-token signing key — **must** be a random 32+ char value in production |
| `NEXTAUTH_URL` | Public base URL of the deployment |
| `NEXT_PUBLIC_APP_NAME` | Display name |
| `NEXT_PUBLIC_APP_URL` | Public URL for client-side use |

Secrets belong in the environment, never in git. `.env` and all local databases
are git-ignored.

## Common scripts

| Script | Does |
| --- | --- |
| `npm run dev` / `build` / `start` | Next.js dev / production build / serve |
| `npm run lint` | ESLint |
| `npm run db:push` | Apply the Prisma schema |
| `npm run db:seed` | Seed branches, settings, permissions (demo users behind `SEED_DEMO_USERS`) |
| `npm run staff:apply` | Provision real staff with unique first passwords |

## Security

This codebase underwent a white-box security audit and access-control review;
see **[`SECURITY-AUDIT.md`](./SECURITY-AUDIT.md)** for the full report. Highlights:

- Server-side authorization on every action; consistent multi-branch isolation;
  hash-chained audit log; bcrypt password storage; no SQL-injection, XSS, or
  `eval` surface.
- Hardening applied in this branch: dual-control enforcement on stock-receipt
  approvals, production-time rejection of weak JWT secrets, branch-scoped
  supplier lookups, HTTP security headers, upload prototype-pollution guards, and
  a consistent password policy.
- Operational follow-ups: upgrade `xlsx` to the SheetJS patched build, add login
  rate limiting / lockout, and implement or remove the dormant 2FA fields.

## Deployment

Production runs on PostgreSQL. Set `DATABASE_URL` to the managed Postgres URL,
provide a strong `NEXTAUTH_SECRET` and the correct `NEXTAUTH_URL`, then build and
start. **Rotate every seeded password immediately after the first boot**, and do
not deploy with `SEED_DEMO_USERS` enabled.

## License

ISC. Proprietary to the business owner; not for redistribution.
