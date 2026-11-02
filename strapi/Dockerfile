# Production image: Strapi (REST API + admin) for the strapi-web frontend.
FROM node:24.22.1-bookworm-slim AS base
ENV STRAPI_TELEMETRY_DISABLED=true
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM base AS prod-deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --prod

# Compiles TypeScript to dist/ and builds the admin panel
FROM base AS builder
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm run build

FROM base AS runner
ENV NODE_ENV=production
COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/dist ./dist
# tsconfig.json tells `strapi start` this is a TypeScript app, so it loads the compiled
# config and code from dist/; without it, it looks for JS in ./config and gets no DB config.
COPY --chown=node:node package.json tsconfig.json favicon.png ./
COPY --chown=node:node public ./public
COPY --chown=node:node database ./database

USER node
EXPOSE 1337
CMD ["pnpm", "start"]
