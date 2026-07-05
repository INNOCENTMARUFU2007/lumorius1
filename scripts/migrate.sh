#!/usr/bin/env bash
# ============================================================
# Lumorius AI — Database Migration Runner
# INMARTECH PVT LTD
# ============================================================
# Usage: ./scripts/migrate.sh [up|down|status]
# ============================================================
set -euo pipefail

source "$(dirname "$0")/../.env" 2>/dev/null || true

SCHEMA_DIR="$(dirname "$0")/../database/schema"
SEEDS_DIR="$(dirname "$0")/../database/seeds"
COMMAND="${1:-up}"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'

info()    { echo -e "${BLUE}[lumorius]${NC} $1"; }
success() { echo -e "${GREEN}[✓]${NC} $1"; }
warn()    { echo -e "${YELLOW}[!]${NC} $1"; }
error()   { echo -e "${RED}[✗]${NC} $1"; exit 1; }

if [ -z "${DATABASE_URL:-}" ]; then
  error "DATABASE_URL is not set"
fi

case "$COMMAND" in
  up)
    info "Running migrations (up)…"

    # Create migration tracking table if not exists
    psql "$DATABASE_URL" -c "
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version     VARCHAR(255) PRIMARY KEY,
        applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    " -q

    # Apply all migration files in order
    for file in $(find "$SCHEMA_DIR" -name "*.sql" | sort); do
      version=$(basename "$file" .sql)
      applied=$(psql "$DATABASE_URL" -t -c "SELECT version FROM schema_migrations WHERE version = '${version}';" | tr -d '[:space:]')

      if [ "$applied" = "$version" ]; then
        warn "Skipping ${version} (already applied)"
      else
        info "Applying ${version}…"
        psql "$DATABASE_URL" -f "$file" -v ON_ERROR_STOP=1 -q
        psql "$DATABASE_URL" -c "INSERT INTO schema_migrations (version) VALUES ('${version}');" -q
        success "${version} applied"
      fi
    done

    success "All migrations applied"
    ;;

  seed)
    info "Running seeds…"
    for file in $(find "$SEEDS_DIR" -name "*.sql" | sort); do
      info "Seeding: $(basename "$file")…"
      psql "$DATABASE_URL" -f "$file" -v ON_ERROR_STOP=1 -q
      success "$(basename "$file") seeded"
    done
    ;;

  status)
    info "Migration status:"
    psql "$DATABASE_URL" -c "
      SELECT version, applied_at
      FROM schema_migrations
      ORDER BY applied_at;
    " 2>/dev/null || echo "No migrations table found — run: ./scripts/migrate.sh up"
    ;;

  reset)
    warn "This will DROP all tables in the database. Ctrl+C to abort…"
    sleep 5
    psql "$DATABASE_URL" -c "
      DROP SCHEMA public CASCADE;
      CREATE SCHEMA public;
      GRANT ALL ON SCHEMA public TO PUBLIC;
    "
    success "Database reset. Run: ./scripts/migrate.sh up"
    ;;

  *)
    echo "Usage: $0 [up|seed|status|reset]"
    exit 1
    ;;
esac
