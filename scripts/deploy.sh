#!/usr/bin/env bash
set -euo pipefail

# GCIS Marketplace — Production Deployment Script
# Usage: sudo bash scripts/deploy.sh
#
# Always rebuilds with --no-cache to guarantee fresh builds.
# Docker BuildKit's layer cache can serve stale COPY layers even when
# source files have changed — --no-cache prevents this.

COMPOSE_FILES="-f docker-compose.yml -f docker-compose.prod.yml"
SERVICES="server client"

echo "=== GCIS Marketplace Deploy ==="
echo ""

# 1. Pull latest code
echo "[1/5] Pulling latest code..."
git pull --ff-only
echo ""

# 2. Build containers (always no-cache to avoid stale layers)
echo "[2/5] Building containers (no-cache)..."
docker compose $COMPOSE_FILES build --no-cache $SERVICES
echo ""

# 3. Deploy (recreate server + client, postgres stays running)
echo "[3/5] Deploying containers..."
docker compose $COMPOSE_FILES up -d $SERVICES
echo ""

# 4. Verify containers are running
echo "[4/5] Verifying deployment..."
sleep 3
docker compose $COMPOSE_FILES ps

# Quick health check
echo ""
echo "Health check:"
if curl -sf http://localhost:3001/api/health > /dev/null 2>&1; then
  echo "  Server: OK"
else
  echo "  Server: WAITING (may still be starting up)"
fi
echo ""

# 5. Verify build artifacts
echo "[5/5] Verifying build artifacts..."
CSS_FILE=$(docker exec gcis-client sh -c 'ls /usr/share/nginx/html/assets/*.css 2>/dev/null' || true)
JS_FILE=$(docker exec gcis-client sh -c 'ls /usr/share/nginx/html/assets/*.js 2>/dev/null' || true)
if [ -n "$CSS_FILE" ] && [ -n "$JS_FILE" ]; then
  echo "  CSS: $(basename $CSS_FILE)"
  echo "  JS:  $(basename $JS_FILE)"

  # Verify teal theme compiled into bundle
  TEAL_COUNT=$(docker exec gcis-client sh -c "grep -o 'teal:' /usr/share/nginx/html/assets/*.js | wc -l" 2>/dev/null || echo "0")
  echo "  Teal classes: $TEAL_COUNT references"

  # Verify cache headers are active
  CACHE_HEADER=$(docker exec gcis-client grep -c "no-cache" /etc/nginx/conf.d/default.conf 2>/dev/null || echo "0")
  if [ "$CACHE_HEADER" -gt 0 ]; then
    echo "  Cache headers: OK (index.html no-cache, assets immutable)"
  else
    echo "  Cache headers: MISSING — check nginx config"
  fi
else
  echo "  WARNING: Could not verify build artifacts"
fi

echo ""
echo "=== Deploy complete ==="
