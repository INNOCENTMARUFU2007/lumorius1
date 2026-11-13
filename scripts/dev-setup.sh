#!/usr/bin/env bash
# =============================================================
# Lumorius AI — Developer Setup Script
# INMARTECH PVT LTD
#
# Usage:  bash scripts/dev-setup.sh
# =============================================================
set -euo pipefail

BOLD="\033[1m"
GREEN="\033[0;32m"
YELLOW="\033[1;33m"
RED="\033[0;31m"
CYAN="\033[0;36m"
RESET="\033[0m"

log()  { echo -e "${BOLD}${GREEN}[lumorius]${RESET} $*"; }
warn() { echo -e "${BOLD}${YELLOW}[warn]${RESET}   $*"; }
err()  { echo -e "${BOLD}${RED}[error]${RESET}  $*" >&2; }
info() { echo -e "${BOLD}${CYAN}[info]${RESET}   $*"; }

# ── Banner ───────────────────────────────────────────────────
echo ""
echo -e "${BOLD}${CYAN}"
echo "  ███╗   ██╗███████╗██╗  ██╗██╗   ██╗███████╗ ██████╗ ███████╗"
echo "  ████╗  ██║██╔════╝╚██╗██╔ ██║   ██║██╔════╝██╔═══██╗██╔════╝"
echo "  ██╔██╗ ██║█████╗   ╚███╔╝ ██║   ██║███████╗██║   ██║███████╗"
echo "  ██║╚██╗██║██╔══╝   ██╔██╗ ██║   ██║╚════██║██║   ██║╚════██║"
echo "  ██║ ╚████║███████╗██╔╝ ██╗╚██████╔╝███████║╚██████╔╝███████║"
echo "  ╚═╝  ╚═══╝╚══════╝╚═╝  ╚═╝ ╚═════╝ ╚══════╝ ╚═════╝ ╚══════╝"
echo -e "${RESET}"
echo -e "  ${BOLD}AI Operating System${RESET} · INMARTECH PVT LTD"
echo ""

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${ROOT_DIR}"

# ── 1. Check prerequisites ───────────────────────────────────
log "Checking prerequisites..."

check_cmd() {
  if ! command -v "$1" &>/dev/null; then
    err "$1 is required but not found. $2"
    exit 1
  fi
  info "✓ $1 $(${1} --version 2>&1 | head -1)"
}

check_cmd node  "Install from https://nodejs.org (v20+)"
check_cmd npm   "Comes with Node.js"
check_cmd docker "Install from https://docs.docker.com/get-docker/"
check_cmd docker-compose "Comes with Docker Desktop; or install separately"

NODE_MAJOR=$(node -e "process.stdout.write(process.version.match(/^v(\d+)/)[1])")
if [[ ${NODE_MAJOR} -lt 20 ]]; then
  err "Node.js 20+ required (found $(node --version))"
  exit 1
fi

if ! command -v pnpm &>/dev/null; then
  warn "pnpm not found — installing globally..."
  npm install -g pnpm@latest
fi

if ! command -v turbo &>/dev/null; then
  warn "turbo not found — installing globally..."
  npm install -g turbo@latest
fi

info "✓ pnpm $(pnpm --version)"
info "✓ turbo $(turbo --version)"

# ── 2. Environment setup ─────────────────────────────────────
log "Setting up environment..."

if [[ ! -f .env ]]; then
  cp .env.example .env
  log "Created .env from .env.example"

  # Generate secure random secrets
  JWT_SECRET=$(node -e "process.stdout.write(require('crypto').randomBytes(64).toString('hex'))")
  JWT_REFRESH=$(node -e "process.stdout.write(require('crypto').randomBytes(64).toString('hex'))")
  SESSION_SECRET=$(node -e "process.stdout.write(require('crypto').randomBytes(64).toString('hex'))")

  if [[ "$(uname)" == "Darwin" ]]; then
    sed -i '' "s|CHANGE_ME_64_CHAR_RANDOM_HEX_STRING_HERE|${JWT_SECRET}|g" .env
    sed -i '' "s|CHANGE_ME_DIFFERENT_64_CHAR_RANDOM_HEX_STRING|${JWT_REFRESH}|g" .env
    sed -i '' "s|CHANGE_ME_SESSION_SECRET_64_CHARS|${SESSION_SECRET}|g" .env
  else
    sed -i "s|CHANGE_ME_64_CHAR_RANDOM_HEX_STRING_HERE|${JWT_SECRET}|g" .env
    sed -i "s|CHANGE_ME_DIFFERENT_64_CHAR_RANDOM_HEX_STRING|${JWT_REFRESH}|g" .env
    sed -i "s|CHANGE_ME_SESSION_SECRET_64_CHARS|${SESSION_SECRET}|g" .env
  fi
  log "✓ Generated secure JWT + session secrets"
else
  warn ".env already exists — skipping (delete it to regenerate secrets)"
fi

# ── 3. Check critical env vars ───────────────────────────────
log "Validating environment variables..."
MISSING=()

check_env() {
  local key="$1"
  local val
  val=$(grep -E "^${key}=" .env | cut -d= -f2-)
  if [[ -z "${val}" || "${val}" == *"CHANGE_ME"* || "${val}" == *"sk-..."* || "${val}" == *"sk_live_"* ]]; then
    MISSING+=("$key")
  fi
}

check_env "DATABASE_URL"
check_env "OPENAI_API_KEY"

if [[ ${#MISSING[@]} -gt 0 ]]; then
  warn "The following env vars still need real values in .env:"
  for key in "${MISSING[@]}"; do
    warn "  → ${key}"
  done
  warn "The app will start but some features won't work until these are set."
fi

# ── 4. Start infrastructure ──────────────────────────────────
log "Starting Docker infrastructure (Postgres + Redis)..."

if ! docker info &>/dev/null; then
  err "Docker daemon is not running. Please start Docker and try again."
  exit 1
fi

docker-compose up -d postgres redis

# Wait for Postgres to be healthy
log "Waiting for PostgreSQL to be ready..."
RETRIES=30
until docker-compose exec -T postgres pg_isready -U lumorius -d lumorius_db &>/dev/null || [[ ${RETRIES} -eq 0 ]]; do
  echo -n "."
  sleep 1
  RETRIES=$((RETRIES - 1))
done
echo ""

if [[ ${RETRIES} -eq 0 ]]; then
  err "PostgreSQL did not become ready in time."
  err "Check: docker-compose logs postgres"
  exit 1
fi
log "✓ PostgreSQL is ready"

# Wait for Redis to be healthy
log "Waiting for Redis to be ready..."
RETRIES=20
until docker-compose exec -T redis redis-cli ping 2>/dev/null | grep -q "PONG" || [[ ${RETRIES} -eq 0 ]]; do
  echo -n "."
  sleep 1
  RETRIES=$((RETRIES - 1))
done
echo ""

if [[ ${RETRIES} -eq 0 ]]; then
  warn "Redis did not respond to PING — it may still be starting. Continuing..."
else
  log "✓ Redis is ready"
fi

# ── 5. Install dependencies ──────────────────────────────────
log "Installing Node.js dependencies..."
pnpm install --frozen-lockfile || pnpm install
log "✓ Dependencies installed"

# ── 6. Summary ───────────────────────────────────────────────
echo ""
echo -e "${BOLD}${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo -e "${BOLD}  Lumorius dev environment is ready! 🚀${RESET}"
echo -e "${BOLD}${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo ""
echo "  Start all services:      turbo dev"
echo "  Start API only:          pnpm --filter @lumorius/api run dev"
echo "  Start Web only:          pnpm --filter @lumorius/web run dev"
echo "  API Swagger docs:        http://localhost:3001/api/docs"
echo "  Web app:                 http://localhost:3000"
echo ""
echo "  Stop infrastructure:     docker-compose down"
echo "  Reset database:          docker-compose down -v && docker-compose up -d postgres redis"
echo ""
if [[ ${#MISSING[@]} -gt 0 ]]; then
  echo -e "  ${YELLOW}⚠️  Remember to set missing env vars in .env before using all features${RESET}"
  echo ""
fi
echo ""
powershell.exe -NoProfile -ExecutionPolicy Bypass -File `
  ".\Executive-Intelligence-PDF-Engine.ps1"