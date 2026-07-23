# Elix Star Live — production build and run
# Uses npm install (not npm ci) so deploy works when lockfile is out of sync.
# Image is kept lean for Coolify: static ffmpeg + server-only npm deps.

FROM node:20-bookworm-slim AS builder

WORKDIR /app

# Install deps with npm install so lockfile sync is not required.
# --include=dev guarantees build tools (vite/typescript) are present
# even if NODE_ENV=production is injected at build time by the platform.
COPY package.json package-lock.json* ./
RUN npm install --include=dev --no-audit --no-fund

COPY . .

ARG VITE_API_URL
ARG VITE_WS_URL
ARG VITE_LIVEKIT_URL
ARG VITE_BUNNY_CDN_HOSTNAME
ARG VITE_BUNNY_STORAGE_ZONE
ARG VITE_STRIPE_PUBLISHABLE_KEY
ARG VITE_APP_NAME
ARG VITE_CDN_URL

ENV VITE_API_URL=$VITE_API_URL
ENV VITE_WS_URL=$VITE_WS_URL
ENV VITE_LIVEKIT_URL=$VITE_LIVEKIT_URL
ENV VITE_BUNNY_CDN_HOSTNAME=$VITE_BUNNY_CDN_HOSTNAME
ENV VITE_BUNNY_STORAGE_ZONE=$VITE_BUNNY_STORAGE_ZONE
ENV VITE_STRIPE_PUBLISHABLE_KEY=$VITE_STRIPE_PUBLISHABLE_KEY
ENV VITE_APP_NAME=$VITE_APP_NAME
ENV VITE_CDN_URL=$VITE_CDN_URL

RUN npm run build

# Static ffmpeg binaries only — avoids apt pulling 200+ libs that break Coolify image export.
FROM mwader/static-ffmpeg:7.1 AS ffmpeg

# Production image
FROM node:20-bookworm-slim AS runner

WORKDIR /app

COPY --from=ffmpeg /ffmpeg /usr/local/bin/ffmpeg
COPY --from=ffmpeg /ffprobe /usr/local/bin/ffprobe

ENV NODE_ENV=production
ENV PORT=8080

# Server-only production deps (no Capacitor/React/MediaPipe — those break Coolify image export size).
COPY package.json package-lock.json* ./
COPY scripts/strip-client-deps-for-docker.mjs ./scripts/strip-client-deps-for-docker.mjs
RUN node scripts/strip-client-deps-for-docker.mjs \
  && npm install --omit=dev --no-audit --no-fund \
  && npm cache clean --force \
  && rm -f scripts/strip-client-deps-for-docker.mjs

# Copy built frontend and server
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server ./server
COPY --from=builder /app/tsconfig.json ./
COPY --from=builder /app/tsconfig.server.json ./

# Coolify injects env vars directly — no .env file needed in the image.

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://localhost:8080/health').then(r=>{process.exit(r.ok?0:1)}).catch(()=>process.exit(1))"

# Migrations must run once per deploy (Coolify **Release command**: npm run migrate), not here on every replica boot.
CMD ["npm", "run", "start:prod"]
