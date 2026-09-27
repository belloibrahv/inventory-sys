# Abu Twins shop system, for a Hostinger VPS (or any Docker host).
#
# Lives here rather than at the repo root on purpose: Railway switches its
# builder to any root-level Dockerfile it finds, and Railway keeps building
# with Nixpacks as before. Build from the repo root:
#
#   docker build -f deploy/hostinger/Dockerfile -t abutwins .
#
# Usually run through deploy/hostinger/docker-compose.yml.

# ---- Install ---------------------------------------------------------------
FROM node:22-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# ---- Build -----------------------------------------------------------------
FROM deps AS build
WORKDIR /app
COPY . .
# The repo schema says SQLite for local work; production is Postgres, the
# same switch the Railway build makes.
RUN node scripts/use-postgres-schema.mjs && npx prisma generate
# Names this build for the offline worker's cache. There is no .git inside
# the image, so the commit is passed in (see docker-compose.yml).
ARG BUILD_ID=manual
ENV NEXT_PUBLIC_BUILD_ID=$BUILD_ID \
    NEXT_TELEMETRY_DISABLED=1
# next build reads the app's settings module, which refuses a weak secret in
# production. A throwaway value is enough to build; the real one is set when
# the container runs and is never baked into the image.
RUN NEXTAUTH_SECRET=build-only-placeholder-value-not-used-at-runtime \
    DATABASE_URL=postgresql://build:build@localhost:5432/build \
    npx next build

# ---- Run -------------------------------------------------------------------
FROM node:22-bookworm-slim AS run
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates curl \
  && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
# The start-up routine needs the Prisma CLI and tsx as well as Next, so the
# full install comes along rather than Next's trimmed standalone output.
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/.next ./.next
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/prisma ./prisma
COPY --from=build --chown=node:node /app/scripts ./scripts
COPY --from=build --chown=node:node /app/src ./src
COPY --from=build --chown=node:node /app/package.json /app/next.config.mjs /app/tsconfig.json ./
COPY --chown=node:node deploy/hostinger/start.sh ./start.sh
RUN chmod +x ./start.sh
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=90s --retries=3 \
  CMD curl -fsS http://127.0.0.1:3000/api/health || exit 1
CMD ["./start.sh"]
