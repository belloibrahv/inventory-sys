import { defineRailway, project, service } from "railway/iac";

export default defineRailway(() => {
  const web = service("inventory-sys", {
    build: "node scripts/use-postgres-schema.mjs && npx prisma generate && npm run build",
    start: "node scripts/use-postgres-schema.mjs && npx prisma generate && npx prisma db push && npx tsx prisma/seed-users.ts && npm start",
    healthcheck: "/login",
    healthcheckTimeout: 300,
    // builder from CaC: "NIXPACKS"
  });

  return project("inventory-sys", {
    resources: [web],
  });
});
