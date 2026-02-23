#!/usr/bin/env bash
set -euo pipefail

# GCIS Marketplace — Production Deployment Script
#
# ⚠️  RUN THIS ON THE PRODUCTION SERVER, NOT LOCALLY!
#     ssh root@159.203.20.213
#     cd ~/gcis-marketplace-plan && bash scripts/deploy.sh
#
# Always rebuilds with --no-cache to guarantee fresh builds.
# Docker BuildKit's layer cache can serve stale COPY layers even when
# source files have changed — --no-cache prevents this.
#
# Self-update: After git pull, the script re-execs itself if it changed
# on disk, so the latest version always runs the build/deploy steps.

SCRIPT_PATH="$(realpath "$0")"
COMPOSE_FILES="-f docker-compose.yml -f docker-compose.prod.yml"
SERVICES="server client"

# Guard: warn if running on a local dev machine instead of production
if hostname | grep -qiE "desktop|laptop|local|wsl"; then
  echo "⚠️  WARNING: This looks like a local machine ($(hostname))."
  echo "   Deploy should run on the PRODUCTION server:"
  echo "     ssh root@159.203.20.213"
  echo "     cd ~/gcis-marketplace-plan && bash scripts/deploy.sh"
  echo ""
  read -p "Continue anyway? [y/N] " confirm
  if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
    echo "Aborted."
    exit 1
  fi
fi

# Re-exec guard: skip git pull if already re-execed
if [[ "${DEPLOY_REEXEC:-}" == "1" ]]; then
  echo "[1/5] Code already pulled (re-exec)."
  echo ""
else
  echo "=== GCIS Marketplace Deploy ==="
  echo ""

  # 1. Pull latest code
  echo "[1/5] Pulling latest code..."
  git pull --ff-only
  echo ""

  # Re-exec with latest script if it changed
  exec env DEPLOY_REEXEC=1 bash "$SCRIPT_PATH"
fi

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

  # Verify Sentry DSN baked into client bundle
  SENTRY_FOUND=$(docker exec gcis-client sh -c "grep -l 'ingest.us.sentry.io' /usr/share/nginx/html/assets/*.js 2>/dev/null | wc -l" || echo "0")
  if [ "$SENTRY_FOUND" -gt 0 ]; then
    echo "  Frontend Sentry: OK (DSN baked in)"
  else
    echo "  Frontend Sentry: MISSING — check VITE_SENTRY_DSN in .env"
  fi

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
