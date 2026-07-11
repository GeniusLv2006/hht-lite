# Copyright (c) 2026 GeniusLv2006
# SPDX-License-Identifier: MPL-2.0

FROM node:24-alpine AS dependencies

WORKDIR /app

RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:24-alpine

WORKDIR /app

ARG APP_VERSION=development
ARG VCS_REF=unknown
ARG BUILD_DATE=unknown

LABEL org.opencontainers.image.title="hht-lite" \
      org.opencontainers.image.version="$APP_VERSION" \
      org.opencontainers.image.revision="$VCS_REF" \
      org.opencontainers.image.created="$BUILD_DATE" \
      org.opencontainers.image.source="https://github.com/GeniusLv2006/hht-lite"

ENV NODE_ENV=production

COPY --from=dependencies /app/node_modules ./node_modules
COPY package.json package-lock.json server.js version.json ./
COPY src ./src
COPY public ./public
COPY admin ./admin

RUN mkdir -p /app/data

EXPOSE 3100

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://127.0.0.1:3100/healthz || exit 1

CMD ["node", "--max-old-space-size=128", "server.js"]
