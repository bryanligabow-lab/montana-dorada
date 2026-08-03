# Build context = raíz del monorepo (plataforma/).
FROM node:20-slim AS build
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /repo
COPY . .
RUN corepack pnpm install --frozen-lockfile=false
# URL pública de la API, horneada en el bundle del navegador.
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL
RUN corepack pnpm --filter @asis/web build

FROM nginx:alpine AS runtime
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
EXPOSE 80
