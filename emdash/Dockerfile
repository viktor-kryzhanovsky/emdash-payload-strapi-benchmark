# Production image: Astro (node standalone adapter) with EmDash inside.
# Unlike Next's standalone output, Astro's server bundle imports its dependencies
# from node_modules at runtime, so the runner gets production-only node_modules.
FROM node:24.22.1-bookworm-slim AS base
ENV ASTRO_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM base AS prod-deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --prod

FROM base AS builder
# emdash bakes the database config (incl. pool size) into the build
ARG DATABASE_POOL_MAX=10
ARG CMS_CACHE=off
ENV DATABASE_POOL_MAX=$DATABASE_POOL_MAX CMS_CACHE=$CMS_CACHE
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm run build

FROM base AS runner
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./

USER node
EXPOSE 3000
CMD ["node", "./dist/server/entry.mjs"]
