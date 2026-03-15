# Base stage
FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

# Install dependencies
FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/backend/package.json ./packages/backend/
COPY packages/frontend/package.json ./packages/frontend/
RUN pnpm install --frozen-lockfile

# Build shared (backend + frontend depend on it)
FROM deps AS shared-build
COPY packages/shared ./packages/shared
RUN pnpm --filter @instadeploy/shared build

# Build backend
FROM shared-build AS backend-build
COPY packages/backend ./packages/backend
RUN pnpm --filter @instadeploy/backend build

# Build frontend
FROM shared-build AS frontend-build
COPY packages/frontend ./packages/frontend
RUN pnpm --filter @instadeploy/frontend build

# Runtime
FROM node:20-alpine
RUN apk add --no-cache git podman curl && \
    ARCH=$(uname -m) && \
    if [ "$ARCH" = "x86_64" ]; then CF_ARCH="amd64"; \
    elif [ "$ARCH" = "aarch64" ]; then CF_ARCH="arm64"; \
    else CF_ARCH="amd64"; fi && \
    curl -fsSL "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${CF_ARCH}" \
      -o /usr/local/bin/cloudflared && \
    chmod +x /usr/local/bin/cloudflared && \
    apk del curl

# Podman CLI talks to host's podman via mounted socket
ENV CONTAINER_HOST=unix:///run/podman/podman.sock
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=deps /app/packages/backend/node_modules ./packages/backend/node_modules
COPY --from=shared-build /app/packages/shared/dist ./packages/shared/dist
COPY --from=backend-build /app/packages/backend/dist ./packages/backend/dist
COPY --from=frontend-build /app/packages/frontend/dist ./packages/frontend/dist
COPY packages/shared/package.json ./packages/shared/
COPY packages/backend/package.json ./packages/backend/
COPY package.json pnpm-workspace.yaml ./

RUN mkdir -p /app/data

ENV NODE_ENV=production
ENV DATABASE_PATH=/app/data/instadeploy.db
ENV PORT=3001
ENV HOST=0.0.0.0

VOLUME /app/data

EXPOSE 3001

WORKDIR /app/packages/backend
CMD ["node", "dist/index.js"]
