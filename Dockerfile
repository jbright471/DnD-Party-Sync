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

# Install runtime dependencies only (libc6-compat, gcompat, and poppler-utils for pdf processing if needed)
RUN apk add --no-cache libc6-compat gcompat poppler-utils

# Copy node_modules from backend-builder
COPY --chown=node:node --from=backend-builder /app/server/node_modules /app/server/node_modules

# Copy backend source
COPY --chown=node:node server/ /app/server/

# Copy built frontend assets
COPY --chown=node:node --from=frontend-builder /app/client/dist /app/client/dist

WORKDIR /app/server

# Ensure writable dirs exist and are owned by node
RUN mkdir -p /app/server /app/client && chown -R node:node /app

# Switch to non-root user
USER node

# Healthcheck definition
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node /app/server/scripts/healthcheck.js

EXPOSE 3001
CMD ["npm", "start"]
