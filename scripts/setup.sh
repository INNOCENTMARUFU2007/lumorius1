#!/usr/bin/env bash
# ============================================================
# Lumorius AI — One-command Server Setup
# INMARTECH PVT LTD
# ============================================================
# Usage: chmod +x scripts/setup.sh && ./scripts/setup.sh
# Requirements: Node.js 20+, pnpm, PostgreSQL 15+, Redis 7+
# ============================================================
set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

info()    { echo -e "${BLUE}[Lumorius]${NC} $1"; }
success() { echo -e "${GREEN}[✓]${NC} $1"; }
warn()    { echo -e "${YELLOW}[!]${NC} $1"; }
error()   { echo -e "${RED}[✗]${NC} $1"; exit 1; }

echo -e "${BLUE}"
echo "╔══════════════════════════════════════╗"
echo "║   Lumorius AI — Setup Script          ║"
echo "║   INMARTECH PVT LTD                  ║"
echo "╚══════════════════════════════════════╝"
echo -e "${NC}"

# ── Prerequisites ───────────────────────────────────────────
info "Checking prerequisites..."

command -v node  >/dev/null 2>&1 || error "Node.js not found. Install v20+ from https://nodejs.org"
command -v pnpm  >/dev/null 2>&1 || error "pnpm not found. Run: npm install -g pnpm"
command -v psql  >/dev/null 2>&1 || error "PostgreSQL client not found. Install PostgreSQL 15+"

NODE_VER=$(node --version | grep -oP '\d+' | head -1)
if [ "$NODE_VER" -lt 20 ]; then
  error "Node.js v20+ required. Found: $(node --version)"
fi
success "Node.js $(node --version) ✓"
success "pnpm $(pnpm --version) ✓"

# ── Environment ─────────────────────────────────────────────
if [ ! -f .env ]; then
  if [ -f .env.example ]; then
    cp .env.example .env
    warn ".env created from .env.example — PLEASE fill in secrets before continuing!"
    warn "Edit .env then re-run this script."
    exit 1
  else
    error ".env.example not found!"
  fi
fi
success ".env found ✓"

# ── Install deps ─────────────────────────────────────────────
info "Installing dependencies..."
pnpm install --frozen-lockfile 2>/dev/null || pnpm install
success "Dependencies installed ✓"

# ── Database ─────────────────────────────────────────────────
info "Running database migrations..."
source .env

if [ -z "$DATABASE_URL" ]; then
  error "DATABASE_URL not set in .env"
fi

psql "$DATABASE_URL" -f database/schema/001_create_all_tables.sql -v ON_ERROR_STOP=1 \
  && success "Migration 001 applied ✓" \
  || warn "Migration 001 may already exist — continuing"

psql "$DATABASE_URL" -f database/schema/002_email_security_founder_os.sql -v ON_ERROR_STOP=1 \
  && success "Migration 002 applied ✓" \
  || warn "Migration 002 may already exist — continuing"

if [ -f database/seeds/001_billing_plans.sql ]; then
  psql "$DATABASE_URL" -f database/seeds/001_billing_plans.sql \
    && success "Seed data inserted ✓" \
    || warn "Seed may already exist — continuing"
fi

# ── Build ────────────────────────────────────────────────────
info "Building API..."
pnpm --filter @lumorius/api run build
success "API built ✓"

info "Building Web..."
pnpm --filter @lumorius/web run build
success "Web built ✓"

# ── Log directory ────────────────────────────────────────────
mkdir -p logs

# ── Done ─────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}════════════════════════════════════════${NC}"
echo -e "${GREEN}  Lumorius AI is ready to launch! 🚀     ${NC}"
echo -e "${GREEN}════════════════════════════════════════${NC}"
echo ""
echo "  Start with PM2:"
echo "    pm2 start ecosystem.config.js --env production"
echo ""
echo "  Start with Docker Compose:"
echo "    docker compose up -d"
echo ""
echo "  Development mode:"
echo "    pnpm --filter @lumorius/api run dev   # API on :3001"
echo "    pnpm --filter @lumorius/web run dev   # Web on :3000"
echo ""
