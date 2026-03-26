#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

cd "${ROOT_DIR}"

COMPOSE_FILE="docker-compose.prod.yml"

echo "[deploy] Starting Kronosphere production deployment..."

if ! command -v docker >/dev/null 2>&1; then
  echo "[deploy] ERROR: docker is not installed." >&2
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "[deploy] ERROR: docker compose plugin is not available." >&2
  exit 1
fi

if [ ! -f ".env" ]; then
  if [ -f ".env.example" ]; then
    cp .env.example .env
    echo "[deploy] .env was missing; created from .env.example. Update secrets before exposing this server publicly."
  else
    echo "[deploy] ERROR: .env is missing and .env.example was not found." >&2
    exit 1
  fi
fi

echo "[deploy] Validating compose file..."
docker compose -f "$COMPOSE_FILE" config >/dev/null

echo "[deploy] Building and starting traefik + frontend + backend..."
docker compose -f "$COMPOSE_FILE" up -d --build --remove-orphans

echo "[deploy] Service status:"
docker compose -f "$COMPOSE_FILE" ps

echo ""
echo "[deploy] Deployment complete."
echo "[deploy] Site:    https://$(grep -oP '(?<=DOMAIN=).+' .env || echo 'qa.mlsakiit.com')"
echo "[deploy] Health:  https://$(grep -oP '(?<=DOMAIN=).+' .env || echo 'qa.mlsakiit.com')/health"
echo "[deploy] Logs:    docker compose -f $COMPOSE_FILE logs -f"
