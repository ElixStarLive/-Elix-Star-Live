# Elix Star Live — production build and run
# Uses npm install (not npm ci) so deploy works when lockfile is out of sync.

FROM node:20-bookworm-slim AS builder

WORKDIR /app

# Install deps with npm install so lockfile sync is not required.
# --include=dev guarantees build tools (vite/typescript) are present
# even if NODE_ENV=production is injected at build time by the platform.
COPY package.json package-lock.json* ./
RUN npm install --include=dev

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

# Coolify injects env vars directly — no .env file needed in the image.

EXPOSE 8080

# Migrations must run once per deploy (Coolify **Release command**: npm run migrate), not here on every replica boot.
CMD ["npm", "run", "start:prod"]
