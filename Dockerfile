# Elix Star Live — production build and run
# Uses npm install (not npm ci) so deploy works when lockfile is out of sync.

FROM node:20-bookworm-slim AS builder

WORKDIR /app

# Install deps with npm install so lockfile sync is not required
COPY package.json package-lock.json* ./
RUN npm install

COPY . .
RUN cp .env.example .env 2>/dev/null || true
RUN npm run build

# Production image
FROM node:20-bookworm-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080

# Copy package files and install production deps only (tsx needed to run server/index.ts)
COPY package.json package-lock.json* ./
RUN npm install --omit=dev

# Copy built frontend and server
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server ./server
COPY --from=builder /app/tsconfig.json ./
COPY --from=builder /app/tsconfig.server.json ./

# Fallback .env from .env.example so services work even without Coolify env vars.
# dotenv loads with override:false — Coolify/docker-compose env vars always take precedence.
# IMPORTANT: Set DATABASE_URL as a runtime env var pointing to your PostgreSQL host,
# NOT localhost (which means the container itself in Docker).
COPY --from=builder /app/.env.example ./.env

EXPOSE 8080

CMD ["npx", "tsx", "server/index.ts"]
