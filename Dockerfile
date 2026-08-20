# Stage 1: Build the React frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /app/client
COPY client/package*.json ./
RUN npm install --legacy-peer-deps
COPY client/ ./
RUN npm run build

# Stage 2: Build the backend packages (with native compilation tools)
FROM node:20-alpine AS backend-builder
WORKDIR /app/server
RUN apk add --no-cache python3 make g++ libc6-compat gcompat
COPY server/package*.json ./
# Build from source to ensure binary compatibility with Alpine
RUN npm install --build-from-source --omit=dev

# Stage 3: Production lightweight runner
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production

# Refresh the runtime layer and install only the libraries needed by the app.
RUN apk upgrade --no-cache \
  && apk add --no-cache libc6-compat gcompat poppler-utils

# Copy node_modules from backend-builder
COPY --chown=node:node --from=backend-builder /app/server/node_modules /app/server/node_modules

# Copy backend source
COPY --chown=node:node server/ /app/server/

# Copy built frontend assets
COPY --chown=node:node --from=frontend-builder /app/client/dist /app/client/dist

WORKDIR /app/server

# Ensure writable dirs exist and are owned by node. npm and Corepack are build
# tooling, so remove them from the runtime image and start Node directly.
RUN mkdir -p /app/server /app/client \
  && chown -R node:node /app \
  && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
  && rm -f /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /usr/local/bin/yarn /usr/local/bin/pnpm

# Switch to non-root user
USER node

# Healthcheck definition
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node /app/server/scripts/healthcheck.js

EXPOSE 3001
CMD ["node", "server.js"]
