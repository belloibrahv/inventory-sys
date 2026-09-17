# Security Audit & Penetration Test Report

**System:** AbuTwins Nexus — multi-shop inventory, POS & finance platform
**Stack:** Next.js 16 (App Router, Server Actions), Prisma ORM, NextAuth (JWT), SQLite (dev) / PostgreSQL (prod)
**Assessment type:** White-box source audit + authorization / access-control testing
**Date:** 2026-09-17
**Classification:** Confidential — internal & appointed testing partner only

---

## 1. Executive summary

The application is well-architected from a security standpoint. Authentication is
centralised, authorization is enforced server-side on a per-action basis, branch
isolation (multi-tenant data separation) is applied consistently, and a
tamper-evident hash-chained audit log records privileged activity. No SQL
injection, cross-site scripting (XSS) sinks, `eval`, or command-injection vectors
were found.

The audit identified **9 findings**. The 3 highest-impact issues have been
**remediated in this branch**; the remainder are hardening recommendations, of
which the code-level items are also fixed. One item (the `xlsx` dependency)
cannot be fully closed in code and carries an operational recommendation.

| # | Severity | Finding | Status |
|---|----------|---------|--------|
| F-1 | **High** | Dual-control bypass on incoming-stock approval server actions | ✅ Fixed |
| F-2 | **High** | Vulnerable dependency `xlsx@0.18.5` (prototype pollution + ReDoS) on an untrusted-upload path | ⚠️ Mitigated in code; upgrade recommended |
| F-3 | **Medium** | Weak / placeholder JWT signing secret usable in production | ✅ Fixed |
| F-4 | **Medium** | Cross-branch information disclosure via `getSupplier` (IDOR) | ✅ Fixed |
| F-5 | **Medium** | Missing HTTP security headers (clickjacking, MIME sniffing, HSTS) | ✅ Fixed |
| F-6 | **Low** | Unauthenticated server action `getUnclosedBusinessDays` | ✅ Fixed |
| F-7 | **Low** | Inconsistent / weak password minimum length (6 vs 8) | ✅ Fixed |
| F-8 | **Low** | No account lockout / rate limiting on failed logins (alert only) | 📋 Recommended |
| F-9 | **Info** | 2FA schema fields present but feature not implemented | 📋 Recommended |

---

## 2. Scope & methodology

- **In scope:** the application source under `src/`, authentication and session
  handling, all Server Actions (the primary attack surface — there are only two
  conventional API routes), authorization / RBAC, multi-branch data isolation,
  file-upload processing, dependency posture, and secrets handling.
- **Approach:** manual white-box review of every `"use server"` module (each
  exported function is a network-reachable POST endpoint in Next.js), automated
  scans for injection and XSS sinks, `npm audit` dependency review, git-history
  secret scan, and static verification of tenant-isolation checks on
  record-by-ID lookups.
- **Testing safety:** all dynamic testing was performed against an isolated
  **copy** of the development database. The live `prisma/dev.db` was never
  modified.

---

## 3. Detailed findings

### F-1 — Dual-control bypass on incoming-stock approval (High)

**Location:** `src/app/actions/incoming.ts` — `completeIncomingReceiveApproval`,
`rejectIncomingReceiveApproval`.

In Next.js, **every function exported from a `"use server"` file is an
independent, network-reachable endpoint**, regardless of which UI buttons are
shown. These two functions finalise a received carton into sellable stock (or
reject it) and were the mechanism behind the "second yes" (four-eyes) control in
`decideApproval`. As exported actions, however, they:

1. performed **no authentication or permission check** of their own;
2. accepted a caller-supplied `deciderId`, which was written verbatim into the
   audit log — allowing an attacker to **attribute the approval to another user**;
3. did **not** re-check the four-eyes rule (approver ≠ the person who checked the
   carton in).

**Impact:** any authenticated low-privilege user (e.g. a cashier) could POST
directly to this action to approve their **own** received goods into sellable
inventory and forge the approver identity in the trail — defeating a core
anti-fraud control.

**Remediation (applied):** both actions now call `requireUser()`, enforce
`canApprove(role)`, re-assert the four-eyes rule by loading the pending
`Approval`, and derive the decider from the **session** rather than the
spoofable parameter. The legitimate `decideApproval` path is unaffected.

---

### F-2 — Vulnerable `xlsx` dependency on an untrusted-upload path (High)

**Location:** dependency `xlsx@0.18.5`; parsers in `src/lib/table-file.ts` and
`src/app/actions/{uploads,catalog,opening-stock,ops}.ts`.

`npm audit` flags `xlsx` for **Prototype Pollution** (GHSA-4r6h-8v6p-xvw6) and
**ReDoS** (GHSA-5pgg-2g8v-p4x9), with **no fixed version published on npm**.
Staff-uploaded spreadsheets flow directly into `XLSX.read(...)`, so a crafted
workbook is an attacker-controlled input.

**Remediation (applied):** all spreadsheet paths that build objects from
sheet-controlled keys now strip the dangerous keys `__proto__`, `prototype`, and
`constructor` before they can become object properties, and build rows on
null-prototype objects. This closes the prototype-pollution vector in code.

**Operational recommendation (open):** the ReDoS vector lives inside the library
and cannot be fully mitigated from the app. Upgrade to the official patched
build, which SheetJS distributes from its own CDN rather than npm:

```jsonc
// package.json
"xlsx": "https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz"
```

Continue to enforce the existing upload size cap and process uploads only for
authorised roles.

---

### F-3 — Weak / placeholder JWT signing secret (Medium)

**Location:** `.env` (`NEXTAUTH_SECRET`), `src/lib/auth.ts`.

The development `NEXTAUTH_SECRET` was a short, human-readable placeholder
(`"…-change-in-prod-32"`). NextAuth signs every session JWT with this value; a
guessable or shared secret allows an attacker to **forge a session token for any
user, including the System Administrator, without a password**. The value was
correctly git-ignored (never committed — verified against full history), but
nothing prevented it from reaching production.

**Remediation (applied):** `auth.ts` now **refuses to boot in production** when
the secret is missing, shorter than 32 characters, or a known placeholder. The
local development secret has been rotated to a random 32-byte value.

---

### F-4 — Cross-branch disclosure via `getSupplier` (Medium / IDOR)

**Location:** `src/app/actions/parties.ts` — `getSupplier`.

Supplier records are shared across shops, but their **purchase bills and IMEI
records carry per-shop cost prices and stock**. `getSupplier` returned all of a
supplier's bills and phones across every branch with no scoping, so a single-shop
staff member could read other branches' buying prices and inventory via a
supplier id in the address bar. (Sibling getters `getSale`, `getPurchase`,
`getCustomer` were already correctly scoped — see §4.)

**Remediation (applied):** the included `purchases` and `imeiRecords` are now
filtered through `viewBranchFilter`, so shop staff see only their own branch's
dealings while head office (all-shops view) is unaffected.

---

### F-5 — Missing HTTP security headers (Medium)

**Location:** `next.config.mjs` (previously none).

No `Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options`,
`Referrer-Policy`, `Permissions-Policy`, or `Strict-Transport-Security` were
sent. This left the app open to clickjacking, MIME-type sniffing, and referrer
leakage of ids in URLs.

**Remediation (applied):** a `headers()` policy now sets `X-Frame-Options: DENY`
and CSP `frame-ancestors 'none'` (anti-clickjacking), `nosniff`, HSTS,
`Referrer-Policy: strict-origin-when-cross-origin`, a locked-down
`Permissions-Policy`, and a conservative CSP. The CSP retains `'unsafe-inline'` /
`'unsafe-eval'` for scripts to remain compatible with Next's runtime; tightening
this with per-request nonces is a recommended follow-up.

---

### F-6 — Unauthenticated server action `getUnclosedBusinessDays` (Low)

**Location:** `src/app/actions/day-close.ts`.

Exported from a `"use server"` file with no guard, this leaked which trading days
a caller-supplied branch had not yet closed. **Remediation (applied):** now
requires a signed-in user and scopes the branch via `canReachBranch`.

---

### F-7 — Inconsistent password minimum length (Low)

`changePassword` required 8 characters while `createStaff` accepted 6.
**Remediation (applied):** both now require a minimum of 8. A future improvement
is a shared complexity policy and rotation of the seeded demo passwords.

---

### F-8 — No login rate limiting / account lockout (Low, recommended)

`authorize` records failed logins and raises an alert after 3 failures in 10
minutes, but never **locks** the account or throttles attempts, leaving online
password brute-forcing viable. **Recommendation:** add per-account and per-IP
rate limiting with temporary lockout (e.g. exponential backoff after 5 failures),
enforced at the credential provider or an edge proxy.

---

### F-9 — 2FA present in schema but unimplemented (Info, recommended)

`User.twoFactorEnabled` and `User.totpSecret` exist but no verification flow uses
them. This risks a false sense of assurance. **Recommendation:** either implement
TOTP verification for privileged roles (`SUPER_ADMIN`, `CEO`, books desk) or
remove the dormant fields.

---

## 4. Positive observations (controls that held up)

- **Server-side authorization on every mutating action** via `requireUser()` +
  `can(role, key)`; the UI permission map is *not* trusted as the control.
- **Consistent multi-tenant isolation** through `branchFilter` / `scopeRecord` /
  `canReachBranch`; record-by-id getters return `null` (not "forbidden") for
  out-of-branch records, avoiding an existence oracle.
- **Tamper-evident audit trail**: `AuditLog` rows are SHA-256 hash-chained
  (`stampHash`) with a `verifyAuditChain` integrity check; risk levels and login
  IPs are captured automatically.
- **Passwords** stored with bcrypt; login failures logged; privilege-escalation
  guards prevent non-super-admins from minting super-admins or editing them.
- **Secrets** correctly git-ignored; **no secrets in git history**; demo user
  seeding gated behind `SEED_DEMO_USERS`.
- **No injection surface**: no raw SQL, no `dangerouslySetInnerHTML`, no `eval`.

---

## 5. Dependency posture

`npm audit`: 6 high-severity advisories. `xlsx` is the only one on an
attacker-reachable path and is addressed in F-2. The others (`@prisma/config`,
`@serwist/turbopack`, `browserslist`, `deepmerge-ts`, transitive `prisma`) are
build/tooling-time and lower risk; schedule a maintenance upgrade and re-run
`npm audit` in CI.

---

## 6. Handoff notes for the appointed testing partner

The delivered package is a **clean source snapshot**. The following were
**deliberately excluded** because they contain live data or credentials and must
never leave the organisation:

- `prisma/dev.db` — real database (staff emails + bcrypt hashes)
- `.env` — environment secrets
- `docs/staff-logins.secrets.json`, `docs/Abu-Twins-Staff-Logins.docx` — live
  staff login credentials

To stand up a **test instance with throwaway data**:

```bash
npm install
cp .env.example .env            # then set a strong NEXTAUTH_SECRET
npx prisma generate
npx prisma db push
SEED_DEMO_USERS=true npm run db:seed
npm run dev
```

Recommended next-phase testing: authenticated session fuzzing of every Server
Action for authorization gaps, JWT handling, upload abuse (zip bombs / malformed
workbooks), and business-logic tests around approvals, day-close, and payment
reversals.
