FROM node:20-alpine

WORKDIR /app

# Install build dependencies for better-sqlite3
RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

# Create mount point directories (public/ and admin/ are bind-mounted at runtime)
RUN mkdir -p /app/data /app/public /app/admin

EXPOSE 3100

CMD ["node", "--max-old-space-size=128", "server.js"]
