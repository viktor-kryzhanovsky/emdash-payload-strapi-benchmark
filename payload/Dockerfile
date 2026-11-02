# Production image: Next.js standalone server with Payload inside.
# Requires `output: 'standalone'` in next.config.ts.
FROM node:24.22.1-bookworm-slim AS base
ENV NEXT_TELEMETRY_DISABLED=1
RUN corepack enable

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# CMS_CACHE=page switches next.config rewrites to the cached route group (build time)
ARG CMS_CACHE=off
ENV CMS_CACHE=$CMS_CACHE
RUN pnpm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

RUN groupadd --system --gid 1001 nodejs && useradd --system --uid 1001 --gid nodejs nextjs
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
# optional multi-process mode: CMD ["node", "cluster.mjs"] + WORKERS=n
COPY --chown=nextjs:nodejs cluster.mjs ./

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
