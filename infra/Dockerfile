# Garimpa · uma imagem com API + build do PWA (a API serve o front e as fotos)
FROM node:22-bookworm-slim AS build
RUN corepack enable && corepack prepare pnpm@10.28.0 --activate
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY api/package.json api/
COPY web/package.json web/
RUN pnpm install --frozen-lockfile
COPY api api
COPY web web
COPY db db
RUN pnpm --filter garimpa-web build && pnpm --filter garimpa-api build
RUN pnpm --filter garimpa-api --prod deploy /out/api

FROM node:22-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /out/api /app/api
COPY --from=build /app/web/dist /app/web/dist
COPY db /app/db
RUN mkdir -p /data/uploads && chown -R node:node /data /app
USER node
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD node -e "fetch('http://127.0.0.1:8787/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "/app/api/dist/main.js"]
