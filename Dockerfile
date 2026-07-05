# API image (blueprint §10): multi-stage, node:20-alpine, non-root.
# Used as the Render runtime and for local prod-parity runs.

FROM node:20-alpine AS build
WORKDIR /app
# Manifests first so dependency layers cache across code changes
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci
COPY tsconfig.base.json ./
COPY shared/ shared/
COPY server/ server/
# tsc -b follows project references: builds shared, then server
RUN npm run build -w @courtbook/server && npm prune --omit=dev

FROM node:20-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --chown=node:node --from=build /app/package.json ./
COPY --chown=node:node --from=build /app/node_modules node_modules
COPY --chown=node:node --from=build /app/shared/package.json shared/package.json
COPY --chown=node:node --from=build /app/shared/dist shared/dist
COPY --chown=node:node --from=build /app/server/package.json server/package.json
COPY --chown=node:node --from=build /app/server/dist server/dist
USER node
EXPOSE 3000
CMD ["node", "server/dist/index.js"]
