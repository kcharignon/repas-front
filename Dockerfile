# syntax=docker/dockerfile:1
# Front Repas : développement et tests (`dev`), build (`build`), image de production (`prod`).

ARG NODE_VERSION=24

FROM node:${NODE_VERSION}-bookworm-slim AS deps
WORKDIR /app
SHELL ["/bin/bash", "-o", "pipefail", "-c"]
RUN chown node:node /app
USER 1000
COPY --chown=node:node package.json package-lock.json ./
RUN npm ci \
    && sha256sum package-lock.json | cut -d' ' -f1 > node_modules/.lock-hash

# Développement : serveur Vite avec rechargement à chaud, tests unitaires et Playwright (Chromium) dans le même conteneur.
# Le code source est monté par compose ; node_modules vit dans un volume, renouvelé par l'entrypoint quand le lock change.
FROM deps AS dev
USER 0
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
RUN mkdir /ms-playwright && chown node:node /ms-playwright \
    && npx playwright install-deps chromium \
    && rm -rf /var/lib/apt/lists/*
COPY docker/entrypoint.sh /usr/local/bin/entrypoint
RUN chmod +x /usr/local/bin/entrypoint
USER 1000
RUN npx playwright install chromium
EXPOSE 5173
ENTRYPOINT ["entrypoint"]
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]

FROM deps AS build
COPY --chown=node:node . .
RUN npm run build-only

# Production : fichiers statiques servis par Caddy, `/api` et `/images` relayés vers le back (même origine, ADR 0004).
FROM caddy:2-alpine AS prod
COPY docker/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv
EXPOSE 80
