FROM node:24-alpine AS dependencies

WORKDIR /app

RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:24-alpine

WORKDIR /app

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
