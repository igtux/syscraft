# Stage 1: Build
FROM node:20-alpine AS build

WORKDIR /app

# Copy root package files
COPY package.json package-lock.json* ./

# Copy client and server package files
COPY client/package.json client/package-lock.json* ./client/
COPY server/package.json server/package-lock.json* ./server/

# Install dependencies in root, client, and server
RUN npm install --ignore-scripts
RUN cd client && npm install
RUN cd server && npm install

# Copy all source code
COPY client/ ./client/
COPY server/ ./server/

# Build client (Vite)
RUN cd client && npm run build

# Generate Prisma client
RUN cd server && npx prisma generate

# Build server (TypeScript)
RUN cd server && npm run build

# Stage 2: Production
FROM node:20-alpine AS production

WORKDIR /app

# Create data directory and install ping utility for liveness checks
RUN mkdir -p /app/data
RUN apk add --no-cache iputils

# Copy server package files and install production deps only
COPY server/package.json server/package-lock.json* ./server/
RUN cd server && npm install --omit=dev

# Copy Prisma schema (needed for db push at startup)
COPY --from=build /app/server/prisma ./server/prisma

# Re-generate Prisma client against production node_modules
RUN cd server && npx prisma generate

# Copy built server
COPY --from=build /app/server/dist ./server/dist

# Copy built client into server's static directory
COPY --from=build /app/client/dist ./client/dist

# Set working directory to server
WORKDIR /app/server

# Environment
ENV NODE_ENV=production
EXPOSE 4000

# Start: run migrations then start the server
CMD ["sh", "-c", "npx prisma db push --skip-generate && node dist/index.js"]
