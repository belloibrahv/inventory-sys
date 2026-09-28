import { defineRailway, project, service } from "railway/iac";

export default defineRailway(() => {
  const web = service("inventory-sys", {
    build: "node scripts/use-postgres-schema.mjs && npx prisma generate && npm run build",
    // The heal may fail on a brand-new empty database (no table yet); that must not stop the start.
    start: "node scripts/use-postgres-schema.mjs && npx prisma generate && (npx tsx scripts/heal-day-closes.ts || echo 'Nothing to heal yet (new database?), carrying on') && npx prisma db push --accept-data-loss && npx tsx prisma/seed-users.ts && npm start",
    healthcheck: "/api/health",
    healthcheckTimeout: 300,
    // builder from CaC: "NIXPACKS"
  });

  return project("inventory-sys", {
    resources: [web],
  });
});
