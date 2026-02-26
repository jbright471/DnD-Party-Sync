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

# Enable SQLite in Alpine
RUN apk add --no-cache python3 make g++

# Copy backend package files and install production dependencies
WORKDIR /app/server
COPY server/package*.json ./
RUN npm install --omit=dev

# Copy backend source
COPY server/ ./

# Copy built frontend from Stage 1 into the server's expected location
COPY --from=frontend-builder /app/client/dist /app/client/dist

# Ensure the data directory exists and is writable
RUN mkdir -p /app/data && chown -R node:node /app/data

# Switch to non-root user for security
USER node

# Expose the port the app runs on
EXPOSE 3001

# Start the server
CMD ["npm", "start"]
