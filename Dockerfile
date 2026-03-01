# Stage 1: Build the React frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /app/client
# Copy package files and install dependencies
COPY client/package*.json ./
RUN npm install
# Copy the rest of the frontend source and build
COPY client/ ./
RUN npm run build

# Stage 2: Setup the Express backend and serve the frontend
FROM node:20-alpine
WORKDIR /app

# Enable SQLite and build tools in Alpine
# gcompat often helps with pre-built binaries expecting glibc
RUN apk add --no-cache python3 make g++ poppler-utils libc6-compat gcompat

# Copy backend package files and install production dependencies
WORKDIR /app/server
COPY server/package*.json ./
# Build from source to ensure binary compatibility with Alpine
RUN npm install --build-from-source --omit=dev

# Copy backend source
COPY server/ ./


# Copy built frontend from Stage 1 into the server's expected location
COPY --from=frontend-builder /app/client/dist /app/client/dist

# Ensure the app directories exist and are writable by the node user
RUN mkdir -p /app/server /app/client && chown -R node:node /app

# Switch to non-root user for security
USER node

# Expose the port the app runs on
EXPOSE 3001

# Start the server
CMD ["npm", "start"]
