#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

cd "${ROOT_DIR}"

echo "[deploy] Starting Kronosphere Docker deployment..."

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
docker compose config >/dev/null

echo "[deploy] Building and starting frontend + backend..."
docker compose up -d --build --remove-orphans

echo "[deploy] Service status:"
docker compose ps

echo "[deploy] Deployment complete."
echo "[deploy] Frontend: http://<your-vps-ip>:8080"
echo "[deploy] Backend health: http://<your-vps-ip>:4000/health"
echo "[deploy] Tail logs: docker compose logs -f"
