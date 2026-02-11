# Stage 1: Build
FROM node:20-alpine AS build

WORKDIR /app

# Copy root workspace files
COPY package.json package-lock.json ./
COPY client/package.json client/package.json

# Install client workspace dependencies
RUN npm ci --workspace=client

# Copy client source
COPY client/ client/

# Vite embeds env vars at build time - pass as build arg
ARG VITE_CLERK_PUBLISHABLE_KEY
ARG VITE_API_URL
ENV VITE_CLERK_PUBLISHABLE_KEY=$VITE_CLERK_PUBLISHABLE_KEY
ENV VITE_API_URL=$VITE_API_URL

RUN npm run build --workspace=client

# Stage 2: Serve with nginx
FROM nginx:alpine

# Copy built static files
COPY --from=build /app/client/dist /usr/share/nginx/html

# Copy nginx config
COPY client/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
