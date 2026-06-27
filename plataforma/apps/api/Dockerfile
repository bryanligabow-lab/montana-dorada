# Build context = raíz del monorepo (plataforma/).
FROM node:20-slim AS build
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /repo
COPY . .
RUN corepack pnpm install --frozen-lockfile=false
RUN corepack pnpm --filter @asis/api build
# Genera un paquete portable con solo dependencias de producción.
RUN corepack pnpm --filter=@asis/api --prod deploy /out

FROM node:20-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /out /app
EXPOSE 8080
CMD ["node", "dist/index.js"]
