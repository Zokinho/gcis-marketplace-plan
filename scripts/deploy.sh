#!/usr/bin/env bash
set -euo pipefail

# GCIS Marketplace — Production Deployment Script
# Usage: sudo bash scripts/deploy.sh [--full]
#   --full: Rebuild all containers with no cache (slower, guarantees clean build)
#   default: Rebuild server + client only (faster, uses Docker layer cache)

COMPOSE_FILES="-f docker-compose.yml -f docker-compose.prod.yml"
SERVICES="server client"

echo "=== GCIS Marketplace Deploy ==="
echo ""

# 1. Pull latest code
echo "[1/5] Pulling latest code..."
git pull --ff-only
echo ""

# 2. Build containers
if [[ "${1:-}" == "--full" ]]; then
  echo "[2/5] Building containers (no cache — full rebuild)..."
  docker compose $COMPOSE_FILES build --no-cache $SERVICES
else
  echo "[2/5] Building containers..."
  docker compose $COMPOSE_FILES build $SERVICES
fi
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
CSS_FILE=$(docker exec gcis-client ls /usr/share/nginx/html/assets/*.css 2>/dev/null | head -1)
JS_FILE=$(docker exec gcis-client ls /usr/share/nginx/html/assets/*.js 2>/dev/null | head -1)
if [ -n "$CSS_FILE" ] && [ -n "$JS_FILE" ]; then
  echo "  CSS: $(basename $CSS_FILE)"
  echo "  JS:  $(basename $JS_FILE)"

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
echo "Note: Users with cached browsers will get the new version on next page load"
echo "      (index.html is served with no-cache headers)"
