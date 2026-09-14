# Abu Twins — Production readiness fix board

Honest status after codebase audit. Screens are largely built; these items close the gaps before Excel / WhatsApp / notebooks can be dropped.

## P0 — Fix before full go-live (shop truth)

| ID | Item | Why it matters | Status |
|---|---|---|---|
| P0-1 | **IMEI sale ↔ shelf quantity** | Selling a phone marked IMEI Sold but left Shop stock high → false stock & false value | **Fixed in code** — `checkoutSale` now `drawStock` after `claimImei`. Heal old drift: `npx tsx scripts/heal-imei-shelf.ts --apply` |
| P0-2 | **Heal production / local shelf drift** | Past sales already inflated shelf counts | Script ready; run on each DB that sold phones before P0-1 |
| P0-3 | **E2E sign-off of the 13 go-live steps** on production | Checklist is not “done” until admin + auditor walk it live | Pending human test |
| P0-4 | **Receive shortage alert** (expected 50 / got 48) | Auditor must see variance without Excel | **Fixed** — expected/received stored on each line; note required on mismatch; books desk + managers alerted; carton list shows short/extra |
| P0-5 | **Prove transfer 10 phones Ibadan→Lagos** | Branch truth + audit trail | Code exists; must be signed off on live data |

## P1 — Close soon (controls & master data)

| ID | Item | Notes |
|---|---|---|
| P1-1 | Edit shop details after create | **Done** — Shops → Edit shop details (name, code, address, phone, email) |
| P1-2 | Reassign staff to another shop | **Done** — Staff → Edit job or move shop (audit logged) |
| P1-3 | Brand & category admin screens | **Done** — Phones & items → Brands & categories (add / rename / remove when unused) |
| P1-4 | Cost re-check at goods receipt | Wrong PO cost becomes permanent profit base |
| P1-5 | Dual-control on incoming arrival | Optional second yes before sellable |
| P1-6 | Below-min price → approval queue | Today hard block / override only |
| P1-7 | Distinct “Under repair” IMEI status | Repair job exists; IMEI status map is fuzzy |
| P1-8 | Reports period filter + Excel export parity | Books have day/week/month; reports pack weaker on Excel |

## P2 — Strengthen later (not first-shop blockers)

| ID | Item | Notes |
|---|---|---|
| P2-1 | True wholesale mode | Dealer prices / terms (flag exists only) |
| P2-2 | % / brand / category bulk price update | Selected absolute prices work today |
| P2-3 | Full GL / P&L / cash-flow statements | Money in & out + profit + books are shop-grade |
| P2-4 | Offline receipts & offline stock count | Offline sales + sync already work |
| P2-5 | High-debt threshold watches | Unpaid invoice alerts exist |
| P2-6 | Transfer IMEI as proper relation (not notes) | Works; brittle for long-term audit |

## How to verify P0-4

1. Book a Coming carton for e.g. 50 pieces (or 5 IMEIs).
2. Preview and receive with only 48 (or untick 2 IMEIs).
3. Confirm is blocked until you write a note.
4. After confirm: carton shows **expected 50 · got 48 · short 2**.
5. Auditor / accountant / admin get an Alerts notification.
6. Linked supplier bill goes to **Part received** if anything remains.

## How to verify P0-1

1. Pick an In-shop phone; note Shop stock qty for that model.
2. Sell it on Sell now.
3. IMEI status → Sold; Shop stock qty → down by 1.
4. Home “Do phone numbers match the shelf?” → They match (after heal if old drift).

```bash
# Repair shelves that drifted before the fix
npx tsx scripts/heal-imei-shelf.ts          # dry run
npx tsx scripts/heal-imei-shelf.ts --apply  # write
```

On Railway production, run the heal via SSH against production Postgres after deploy.
