FROM node:24-alpine

WORKDIR /app

# Install build dependencies for better-sqlite3
RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

# Create mount point directories (public/ and admin/ are bind-mounted at runtime)
RUN mkdir -p /app/data /app/public /app/admin

EXPOSE 3100

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://127.0.0.1:3100/healthz || exit 1

CMD ["node", "--max-old-space-size=128", "server.js"]
