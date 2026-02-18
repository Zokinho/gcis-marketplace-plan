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
ARG VITE_API_URL
ARG VITE_SENTRY_DSN
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_SENTRY_DSN=$VITE_SENTRY_DSN

RUN npm run build --workspace=client

# Stage 2: Serve with nginx
FROM nginx:alpine

# Copy built static files
COPY --from=build /app/client/dist /usr/share/nginx/html

# Copy both nginx configs (dev + SSL template)
COPY client/nginx-dev.conf /etc/nginx/nginx-dev.conf
COPY client/nginx-ssl.conf.template /etc/nginx/nginx-ssl.conf.template

# Create ACME challenge directory
RUN mkdir -p /var/www/certbot

EXPOSE 80 443

# Dual-mode startup: if SSL_DOMAIN is set, use SSL template; otherwise use dev config
# If no .htpasswd file exists, strip basic auth directives to avoid Nginx errors
CMD ["/bin/sh", "-c", "if [ -n \"$SSL_DOMAIN\" ]; then envsubst '${SSL_DOMAIN}' < /etc/nginx/nginx-ssl.conf.template > /etc/nginx/conf.d/default.conf; else cp /etc/nginx/nginx-dev.conf /etc/nginx/conf.d/default.conf; fi && if [ ! -f /etc/nginx/.htpasswd ] || [ ! -s /etc/nginx/.htpasswd ]; then sed -i '/auth_basic/d' /etc/nginx/conf.d/default.conf; fi && nginx -g 'daemon off;'"]
