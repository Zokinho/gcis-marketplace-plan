# Stage 1: Build
FROM node:20-alpine AS build

WORKDIR /app

# Copy root workspace files
COPY package.json package-lock.json ./
COPY server/package.json server/package.json

# Install server workspace dependencies
RUN npm ci --workspace=server

# Copy Prisma schema and generate client
COPY server/prisma/ server/prisma/
RUN npx --workspace=server prisma generate

# Copy server source and compile TypeScript
COPY server/tsconfig.json server/tsconfig.json
COPY server/src/ server/src/
RUN npm run build --workspace=server

# Stage 2: Production
FROM node:20-alpine

WORKDIR /app

# Copy node_modules (hoisted to root by npm workspaces, includes generated Prisma client)
COPY --from=build /app/node_modules ./node_modules

# Copy compiled output
COPY --from=build /app/server/dist ./server/dist

# Copy Prisma schema (needed at runtime for migrations/queries)
COPY --from=build /app/server/prisma ./server/prisma

# Copy package files (needed for npm workspace resolution)
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/server/package.json ./server/package.json

# Create uploads directory
RUN mkdir -p /app/uploads

WORKDIR /app/server

EXPOSE 3001

# Startup script: apply pending migrations then start server
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
