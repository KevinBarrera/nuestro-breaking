# Backend production image (#238, ADR 0008). Build from the repository root:
#   docker build -f apps/backend/Dockerfile -t nuestro-breaking-backend .
# Debian (glibc) base so argon2 uses its prebuilt binary; Node matches package.json `engines`.
ARG NODE_IMAGE=node:24.18.1-bookworm-slim

FROM ${NODE_IMAGE} AS build
WORKDIR /repo
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/backend/package.json apps/backend/
RUN pnpm install --frozen-lockfile --filter @nuestro-breaking/backend
COPY apps/backend apps/backend
RUN pnpm --filter @nuestro-breaking/backend build \
  && pnpm --filter @nuestro-breaking/backend deploy --prod --legacy /deploy

FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000
WORKDIR /app
COPY --from=build /deploy/package.json ./
COPY --from=build /deploy/node_modules ./node_modules
COPY --from=build /repo/apps/backend/dist ./dist
COPY --from=build /repo/apps/backend/drizzle ./drizzle
USER node
EXPOSE 3000
# Pre-deploy: node dist/scripts/migrate-database.js
# First admin: node dist/scripts/bootstrap-admin.js
CMD ["node", "dist/src/main.js"]
