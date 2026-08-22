# ============================================================
# AJS Car Care — Dockerfile
# Multi-stage build: compile native deps in a builder stage,
# then ship a slim, non-root runtime image.
# ============================================================

# ---------- Stage 1: install dependencies (incl. native build) ----------
FROM node:20-alpine AS builder

# better-sqlite3 compiles a native module on install — these are needed
# on Alpine (musl) even though they won't exist in the final image.
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy only manifest files first so this layer is cached unless deps change
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# ---------- Stage 2: slim runtime image ----------
FROM node:20-alpine AS runtime

WORKDIR /app

# Run as a non-root user inside the container
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Bring in the already-compiled node_modules from the builder stage
COPY --from=builder /app/node_modules ./node_modules

# Copy the application source
COPY . .

# SQLite database file lives here — mount a volume at this path at runtime
# so booking data survives container restarts/redeploys.
RUN mkdir -p /app/data && chown -R appuser:appgroup /app

USER appuser

ENV PORT=4000
EXPOSE 4000

# Basic container health check using the app's own /api/health route
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:4000/api/health || exit 1

CMD ["node", "server.js"]
