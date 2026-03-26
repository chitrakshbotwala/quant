#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────
#  Kronosphere — One-shot server setup script
#  Run on a fresh Ubuntu/Debian VPS:
#    curl -sSL <raw-url> | bash
#  or clone the repo first and run:
#    chmod +x scripts/setup-server.sh && ./scripts/setup-server.sh
# ─────────────────────────────────────────────────────────
set -euo pipefail

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

log()  { echo -e "${GREEN}[setup]${NC} $*"; }
warn() { echo -e "${YELLOW}[setup]${NC} $*"; }
err()  { echo -e "${RED}[setup]${NC} $*" >&2; }

# ── 1. System dependencies ───────────────────────────────
log "Updating system packages..."
sudo apt-get update -qq

# Install Docker if missing
if ! command -v docker &>/dev/null; then
  log "Installing Docker..."
  sudo apt-get install -y ca-certificates curl gnupg
  sudo install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  sudo chmod a+r /etc/apt/keyrings/docker.gpg

  echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
    $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
    sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

  sudo apt-get update -qq
  sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  sudo systemctl enable --now docker

  # Add current user to docker group so sudo isn't needed
  if [ "${EUID:-$(id -u)}" -ne 0 ]; then
    sudo usermod -aG docker "$USER"
    warn "Added $USER to docker group. You may need to log out and back in for this to take effect."
  fi
  log "Docker installed successfully."
else
  log "Docker already installed: $(docker --version)"
fi

# Install Git if missing
if ! command -v git &>/dev/null; then
  log "Installing Git..."
  sudo apt-get install -y git
fi

# ── 2. Clone repo (if not already inside it) ─────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" 2>/dev/null && pwd || pwd)"
if [ -f "${SCRIPT_DIR}/../docker-compose.prod.yml" ]; then
  ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
  log "Running from existing repo at ${ROOT_DIR}"
else
  CLONE_DIR="/opt/kronosphere"
  if [ -d "$CLONE_DIR/.git" ]; then
    log "Repo already exists at ${CLONE_DIR}, pulling latest..."
    cd "$CLONE_DIR"
    git pull --ff-only
  else
    read -rp "$(echo -e "${CYAN}Enter Git repo URL: ${NC}")" REPO_URL
    sudo mkdir -p "$CLONE_DIR"
    sudo chown "$(id -u):$(id -g)" "$CLONE_DIR"
    git clone "$REPO_URL" "$CLONE_DIR"
  fi
  ROOT_DIR="$CLONE_DIR"
fi

cd "$ROOT_DIR"

# ── 3. Configure environment ─────────────────────────────
if [ -f ".env" ]; then
  warn ".env already exists. Skipping interactive setup."
  warn "Edit manually with: nano ${ROOT_DIR}/.env"
else
  log "Setting up .env from template..."
  cp .env.example .env

  echo ""
  echo -e "${CYAN}═══════════════════════════════════════════════════${NC}"
  echo -e "${CYAN}  Configure Kronosphere Environment${NC}"
  echo -e "${CYAN}═══════════════════════════════════════════════════${NC}"
  echo ""

  # Domain
  read -rp "Domain [qa.mlsakiit.com]: " input_domain
  DOMAIN="${input_domain:-qa.mlsakiit.com}"
  sed -i "s|^DOMAIN=.*|DOMAIN=${DOMAIN}|" .env

  # ACME email
  read -rp "Let's Encrypt email (for TLS certs): " acme_email
  sed -i "s|^ACME_EMAIL=.*|ACME_EMAIL=${acme_email}|" .env

  # Update VITE_API_URL to match domain
  sed -i "s|^VITE_API_URL=.*|VITE_API_URL=https://${DOMAIN}|" .env

  # JWT Secret
  JWT_SECRET=$(openssl rand -hex 32 2>/dev/null || head -c 64 /dev/urandom | base64 | tr -d '\n')
  sed -i "s|^JWT_SECRET=.*|JWT_SECRET=${JWT_SECRET}|" .env
  log "Generated random JWT_SECRET."

  # Firebase backend
  echo ""
  echo -e "${YELLOW}── Firebase (Backend) ──${NC}"
  read -rp "FIREBASE_PROJECT_ID: " fb_project_id
  sed -i "s|^FIREBASE_PROJECT_ID=.*|FIREBASE_PROJECT_ID=${fb_project_id}|" .env

  read -rp "FIREBASE_CLIENT_EMAIL: " fb_client_email
  sed -i "s|^FIREBASE_CLIENT_EMAIL=.*|FIREBASE_CLIENT_EMAIL=${fb_client_email}|" .env

  echo "FIREBASE_PRIVATE_KEY (paste the key, then press Enter):"
  read -rp "> " fb_private_key
  # Escape for sed — private keys contain slashes and special chars
  sed -i "s|^FIREBASE_PRIVATE_KEY=.*|FIREBASE_PRIVATE_KEY=${fb_private_key}|" .env

  # Firebase frontend
  echo ""
  echo -e "${YELLOW}── Firebase (Frontend) ──${NC}"
  read -rp "VITE_FIREBASE_API_KEY: " vfb_api_key
  sed -i "s|^VITE_FIREBASE_API_KEY=.*|VITE_FIREBASE_API_KEY=${vfb_api_key}|" .env

  read -rp "VITE_FIREBASE_AUTH_DOMAIN: " vfb_auth_domain
  sed -i "s|^VITE_FIREBASE_AUTH_DOMAIN=.*|VITE_FIREBASE_AUTH_DOMAIN=${vfb_auth_domain}|" .env

  read -rp "VITE_FIREBASE_PROJECT_ID: " vfb_project_id
  sed -i "s|^VITE_FIREBASE_PROJECT_ID=.*|VITE_FIREBASE_PROJECT_ID=${vfb_project_id}|" .env

  read -rp "VITE_FIREBASE_STORAGE_BUCKET: " vfb_storage
  sed -i "s|^VITE_FIREBASE_STORAGE_BUCKET=.*|VITE_FIREBASE_STORAGE_BUCKET=${vfb_storage}|" .env

  read -rp "VITE_FIREBASE_MESSAGING_SENDER_ID: " vfb_sender
  sed -i "s|^VITE_FIREBASE_MESSAGING_SENDER_ID=.*|VITE_FIREBASE_MESSAGING_SENDER_ID=${vfb_sender}|" .env

  read -rp "VITE_FIREBASE_APP_ID: " vfb_app_id
  sed -i "s|^VITE_FIREBASE_APP_ID=.*|VITE_FIREBASE_APP_ID=${vfb_app_id}|" .env

  # Redis / Upstash (optional)
  echo ""
  echo -e "${YELLOW}── Redis / Upstash (leave blank to skip) ──${NC}"
  read -rp "REDIS_URL: " redis_url
  [ -n "$redis_url" ] && sed -i "s|^REDIS_URL=.*|REDIS_URL=${redis_url}|" .env

  read -rp "UPSTASH_REDIS_REST_URL: " upstash_url
  [ -n "$upstash_url" ] && sed -i "s|^UPSTASH_REDIS_REST_URL=.*|UPSTASH_REDIS_REST_URL=${upstash_url}|" .env

  read -rp "UPSTASH_REDIS_REST_TOKEN: " upstash_token
  [ -n "$upstash_token" ] && sed -i "s|^UPSTASH_REDIS_REST_TOKEN=.*|UPSTASH_REDIS_REST_TOKEN=${upstash_token}|" .env

  echo ""
  log ".env configured successfully."
fi

# ── 4. Open firewall ports ────────────────────────────────
if command -v ufw &>/dev/null; then
  log "Configuring UFW firewall..."
  sudo ufw allow 80/tcp  >/dev/null 2>&1 || true
  sudo ufw allow 443/tcp >/dev/null 2>&1 || true
  sudo ufw allow 22/tcp  >/dev/null 2>&1 || true
  log "Ports 80, 443, 22 allowed."
fi

# ── 5. Deploy ─────────────────────────────────────────────
log "Validating compose file..."
docker compose -f docker-compose.prod.yml config --quiet

log "Building and starting services..."
docker compose -f docker-compose.prod.yml up -d --build --remove-orphans

echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  Kronosphere is deploying!${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════${NC}"
echo ""
docker compose -f docker-compose.prod.yml ps
echo ""
DOMAIN=$(grep -oP '(?<=^DOMAIN=).+' .env 2>/dev/null || echo "qa.mlsakiit.com")
echo -e "  ${CYAN}Site:${NC}    https://${DOMAIN}"
echo -e "  ${CYAN}Health:${NC}  https://${DOMAIN}/health"
echo -e "  ${CYAN}Logs:${NC}    docker compose -f docker-compose.prod.yml logs -f"
echo ""
warn "Make sure DNS A record for ${DOMAIN} points to this server's IP."
warn "TLS certificate will be issued automatically on first request."
