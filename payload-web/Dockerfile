# Production image: Astro (node standalone) rendering pages from the Payload Local API in-process.
# Build context is the repository root: the pages import payload/src (config, collections, data.ts).
#   docker build -f payload-web/Dockerfile .
FROM node:24.22.1-bookworm-slim AS base
ENV ASTRO_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /app/payload-web

FROM base AS deps
COPY payload-web/package.json payload-web/pnpm-lock.yaml payload-web/pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM base AS prod-deps
COPY payload-web/package.json payload-web/pnpm-lock.yaml payload-web/pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --prod

FROM base AS builder
COPY --from=deps /app/payload-web/node_modules ./node_modules
COPY payload/src /app/payload/src
# bare imports inside payload/src resolve against this project's node_modules
RUN ln -s /app/payload-web/node_modules /app/payload/node_modules
COPY payload-web/ ./
# CMS_CACHE=page enables the route cache in astro.config (baked into the build)
ARG CMS_CACHE=off
RUN CMS_CACHE=$CMS_CACHE pnpm run build

FROM base AS runner
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
ENV MEDIA_DIR=/app/payload-web/media
COPY --from=prod-deps --chown=node:node /app/payload-web/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/payload-web/dist ./dist
COPY --chown=node:node payload-web/package.json ./

USER node
EXPOSE 3000
CMD ["node", "./dist/server/entry.mjs"]
