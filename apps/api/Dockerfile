# syntax=docker/dockerfile:1
# Polymath Wes API (also runs the release step as an init container). Build from the repo root:
#   docker build -f apps/api/Dockerfile -t polymath-wes-api .
FROM node:24-slim AS build
WORKDIR /repo
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @wes/api build \
 && pnpm deploy --filter @wes/api --prod /out

FROM node:24-slim
ENV NODE_ENV=production API_PORT=4000 KNOWLEDGE_DIR=/app/knowledge
WORKDIR /app
COPY --from=build --chown=node:node /out/package.json ./package.json
COPY --from=build --chown=node:node /out/node_modules ./node_modules
COPY --from=build --chown=node:node /repo/apps/api/dist ./dist
COPY --from=build --chown=node:node /repo/knowledge ./knowledge
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:4000/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--enable-source-maps", "dist/server.js"]
