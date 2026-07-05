#!/usr/bin/env bash
# ============================================================
# Lumorius AI — Automated Database Backup
# INMARTECH PVT LTD
# ============================================================
# Schedule with cron:
#   0 2 * * * /path/to/lumorius/scripts/backup.sh >> /var/log/lumorius-backup.log 2>&1
#
# Requirements: pg_dump, aws cli (or rclone for other providers)
# ============================================================
set -euo pipefail

source "$(dirname "$0")/../.env" 2>/dev/null || true

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="${BACKUP_DIR:-/var/backups/lumorius}"
BACKUP_FILE="lumorius_${TIMESTAMP}.sql.gz"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
S3_BUCKET="${S3_BUCKET:-lumorius-backups}"
S3_PREFIX="${S3_BACKUP_PREFIX:-db-backups}"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'

log()     { echo "[$(date -Iseconds)] $1"; }
success() { echo -e "${GREEN}[✓]${NC} $1"; }
error()   { echo -e "${RED}[✗]${NC} $1"; exit 1; }

log "=== Lumorius Backup Started ==="

# ── Validate env ────────────────────────────────────────────
if [ -z "${DATABASE_URL:-}" ]; then
  error "DATABASE_URL is not set"
fi

# ── Create backup dir ────────────────────────────────────────
mkdir -p "$BACKUP_DIR"

# ── Dump database ────────────────────────────────────────────
log "Dumping database…"
pg_dump \
  --format=plain \
  --no-owner \
  --no-acl \
  --verbose \
  "$DATABASE_URL" \
  | gzip -9 > "${BACKUP_DIR}/${BACKUP_FILE}" \
  || error "pg_dump failed"

BACKUP_SIZE=$(du -sh "${BACKUP_DIR}/${BACKUP_FILE}" | cut -f1)
success "Backup created: ${BACKUP_FILE} (${BACKUP_SIZE})"

# ── Upload to S3 ─────────────────────────────────────────────
if command -v aws &>/dev/null && [ -n "${AWS_ACCESS_KEY_ID:-}" ]; then
  log "Uploading to S3: s3://${S3_BUCKET}/${S3_PREFIX}/${BACKUP_FILE}"
  aws s3 cp \
    "${BACKUP_DIR}/${BACKUP_FILE}" \
    "s3://${S3_BUCKET}/${S3_PREFIX}/${BACKUP_FILE}" \
    --storage-class STANDARD_IA \
    --server-side-encryption AES256 \
    && success "Uploaded to S3" \
    || log "WARNING: S3 upload failed — backup retained locally"
fi

# ── Prune old local backups ──────────────────────────────────
log "Pruning backups older than ${RETENTION_DAYS} days…"
find "$BACKUP_DIR" -name "lumorius_*.sql.gz" -mtime "+${RETENTION_DAYS}" -delete
success "Old backups pruned"

# ── Verify backup integrity ──────────────────────────────────
log "Verifying backup integrity…"
if gzip -t "${BACKUP_DIR}/${BACKUP_FILE}"; then
  success "Backup integrity verified"
else
  error "Backup file is corrupted!"
fi

log "=== Lumorius Backup Completed: ${BACKUP_FILE} ==="
