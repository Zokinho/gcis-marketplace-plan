#!/bin/bash
# First-time Let's Encrypt certificate provisioning for GCIS Marketplace
#
# Usage: sudo bash scripts/init-letsencrypt.sh
#
# Prerequisites:
#   - Domain DNS A record pointing to this server
#   - Ports 80 and 443 open in firewall
#   - SSL_DOMAIN and SSL_EMAIL set in .env (or passed as env vars)

set -euo pipefail

# Load .env if present
if [ -f .env ]; then
  export $(grep -E '^(SSL_DOMAIN|SSL_EMAIL)=' .env | xargs)
fi

DOMAIN="${SSL_DOMAIN:?Set SSL_DOMAIN in .env or environment}"
EMAIL="${SSL_EMAIL:?Set SSL_EMAIL in .env or environment}"
CERTBOT_DIR="./certbot"
COMPOSE_FILES="-f docker-compose.yml -f docker-compose.prod.yml"

echo "============================================="
echo "  GCIS Marketplace — SSL Certificate Setup"
echo "============================================="
echo "Domain: $DOMAIN"
echo "Email:  $EMAIL"
echo ""

# Step 1: Create directories
echo "[1/5] Creating certbot directories..."
mkdir -p "$CERTBOT_DIR/conf" "$CERTBOT_DIR/www"

# Download recommended TLS parameters
if [ ! -f "$CERTBOT_DIR/conf/options-ssl-nginx.conf" ]; then
  echo "  Downloading recommended TLS parameters..."
  curl -sf https://raw.githubusercontent.com/certbot/certbot/master/certbot-nginx/certbot_nginx/_internal/tls_configs/options-ssl-nginx.conf \
    > "$CERTBOT_DIR/conf/options-ssl-nginx.conf"
fi

if [ ! -f "$CERTBOT_DIR/conf/ssl-dhparams.pem" ]; then
  echo "  Downloading DH parameters..."
  curl -sf https://raw.githubusercontent.com/certbot/certbot/master/certbot/certbot/ssl-dhparams.pem \
    > "$CERTBOT_DIR/conf/ssl-dhparams.pem"
fi

# Step 2: Generate dummy certificate (so Nginx can start)
echo ""
echo "[2/5] Generating dummy certificate..."
CERT_DIR="$CERTBOT_DIR/conf/live/$DOMAIN"
mkdir -p "$CERT_DIR"

if [ ! -f "$CERT_DIR/fullchain.pem" ]; then
  openssl req -x509 -nodes -newkey rsa:4096 -days 1 \
    -keyout "$CERT_DIR/privkey.pem" \
    -out "$CERT_DIR/fullchain.pem" \
    -subj "/CN=localhost" 2>/dev/null
  # Create chain.pem (copy of fullchain for OCSP)
  cp "$CERT_DIR/fullchain.pem" "$CERT_DIR/chain.pem"
  echo "  Dummy certificate created."
else
  echo "  Certificate already exists — skipping dummy generation."
fi

# Step 3: Start Nginx with dummy certificate
echo ""
echo "[3/5] Starting Nginx with dummy certificate..."
docker compose $COMPOSE_FILES up -d client
echo "  Waiting for Nginx to start..."
sleep 5

# Step 4: Request real certificate from Let's Encrypt
echo ""
echo "[4/5] Requesting Let's Encrypt certificate..."

# Remove dummy certificate
rm -rf "$CERT_DIR"

# Request real certificate via webroot ACME challenge
docker compose $COMPOSE_FILES run --rm certbot certonly \
  --webroot \
  --webroot-path=/var/www/certbot \
  --email "$EMAIL" \
  --agree-tos \
  --no-eff-email \
  -d "$DOMAIN" \
  -d "www.$DOMAIN"

echo "  Certificate obtained successfully!"

# Step 5: Reload Nginx with real certificate
echo ""
echo "[5/5] Reloading Nginx with real certificate..."
docker compose $COMPOSE_FILES exec client nginx -s reload

echo ""
echo "============================================="
echo "  SSL setup complete!"
echo "============================================="
echo ""
echo "Next steps:"
echo "  1. Set FORCE_HTTPS=true in .env"
echo "  2. Update FRONTEND_URL=https://$DOMAIN in .env"
echo "  3. Restart: sudo docker compose $COMPOSE_FILES up -d"
echo ""
echo "Certificate auto-renewal is handled by the certbot container (every 12h)."
echo ""
