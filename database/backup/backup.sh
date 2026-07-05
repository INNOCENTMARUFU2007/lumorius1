#!/usr/bin/env bash
# Lumorius AI — Automated Database Backup
# Runs daily via Kubernetes CronJob or cron
# Usage: DATABASE_URL=postgres://... S3_BUCKET=s3://... bash backup.sh

set -euo pipefail

# ── Configuration ─────────────────────────────────────────────

DATABASE_URL="${DATABASE_URL:?DATABASE_URL is required}"
S3_BUCKET="${S3_BUCKET:?S3_BUCKET is required (e.g. s3://lumorius-backups)}"
BACKUP_PREFIX="${BACKUP_PREFIX:-lumorius-backup}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
TIMESTAMP=$(date -u +"%Y%m%d_%H%M%S")
BACKUP_FILE="${BACKUP_PREFIX}_${TIMESTAMP}.sql.gz"
TEMP_DIR=$(mktemp -d)
TEMP_FILE="${TEMP_DIR}/${BACKUP_FILE}"

echo "┌─────────────────────────────────────────────────"
echo "│  Lumorius AI — Database Backup"
echo "│  Timestamp: ${TIMESTAMP}"
echo "│  Destination: ${S3_BUCKET}/daily/"
echo "└─────────────────────────────────────────────────"

# ── Pre-flight checks ─────────────────────────────────────────

command -v pg_dump >/dev/null 2>&1 || { echo "❌ pg_dump not found"; exit 1; }
command -v gzip    >/dev/null 2>&1 || { echo "❌ gzip not found";    exit 1; }
command -v aws     >/dev/null 2>&1 || { echo "❌ aws CLI not found"; exit 1; }

# Verify DB is reachable
echo "→ Verifying database connection..."
psql "${DATABASE_URL}" -c "SELECT 1;" -q --tuples-only > /dev/null \
  || { echo "❌ Cannot connect to database"; exit 1; }
echo "  ✅ Database reachable"

# ── Create backup ─────────────────────────────────────────────

echo "→ Creating backup: ${BACKUP_FILE}"

pg_dump "${DATABASE_URL}" \
  --format=plain \
  --no-owner \
  --no-acl \
  --clean \
  --if-exists \
  --verbose 2>&1 | gzip > "${TEMP_FILE}"

BACKUP_SIZE=$(du -h "${TEMP_FILE}" | cut -f1)
echo "  ✅ Backup created: ${BACKUP_SIZE}"

# ── Encrypt backup ────────────────────────────────────────────

if [[ -n "${ENCRYPTION_KEY:-}" ]]; then
  echo "→ Encrypting backup..."
  openssl enc -aes-256-cbc -salt \
    -in  "${TEMP_FILE}" \
    -out "${TEMP_FILE}.enc" \
    -pass "env:ENCRYPTION_KEY"
  rm "${TEMP_FILE}"
  TEMP_FILE="${TEMP_FILE}.enc"
  BACKUP_FILE="${BACKUP_FILE}.enc"
  echo "  ✅ Backup encrypted"
else
  echo "  ⚠️  ENCRYPTION_KEY not set — backup is unencrypted"
fi

# ── Upload to S3 ──────────────────────────────────────────────

echo "→ Uploading to ${S3_BUCKET}/daily/${BACKUP_FILE}..."

aws s3 cp "${TEMP_FILE}" "${S3_BUCKET}/daily/${BACKUP_FILE}" \
  --storage-class STANDARD_IA \
  --metadata "timestamp=${TIMESTAMP},database=lumorius"

echo "  ✅ Uploaded"

# ── Cross-region replication ──────────────────────────────────

if [[ -n "${S3_BUCKET_SECONDARY:-}" ]]; then
  echo "→ Replicating to secondary region: ${S3_BUCKET_SECONDARY}/daily/"
  aws s3 cp "${S3_BUCKET}/daily/${BACKUP_FILE}" \
    "${S3_BUCKET_SECONDARY}/daily/${BACKUP_FILE}"
  echo "  ✅ Cross-region replication complete"
fi

# ── Apply retention policy ────────────────────────────────────

echo "→ Applying ${RETENTION_DAYS}-day retention policy..."

CUTOFF_DATE=$(date -u -d "${RETENTION_DAYS} days ago" +"%Y-%m-%d" 2>/dev/null \
  || date -u -v-"${RETENTION_DAYS}"d +"%Y-%m-%d")  # macOS fallback

DELETED=0
while IFS= read -r line; do
  if [[ -n "${line}" ]]; then
    aws s3 rm "${line}" || true
    DELETED=$((DELETED + 1))
  fi
done < <(aws s3 ls "${S3_BUCKET}/daily/" \
  | awk '{print $4}' \
  | while read -r fname; do
      fdate=$(echo "${fname}" | grep -oP '\d{8}' | head -1 || echo "")
      if [[ -n "${fdate}" ]] && [[ "${fdate}" < "${CUTOFF_DATE//-/}" ]]; then
        echo "${S3_BUCKET}/daily/${fname}"
      fi
    done)

echo "  ✅ Retention applied: ${DELETED} old backup(s) removed"

# ── Verify backup integrity ───────────────────────────────────

echo "→ Verifying backup integrity..."

VERIFY_FILE="${TEMP_DIR}/verify_${TIMESTAMP}.sql.gz"
aws s3 cp "${S3_BUCKET}/daily/${BACKUP_FILE}" "${VERIFY_FILE}" --quiet

if [[ "${BACKUP_FILE}" == *.enc ]]; then
  openssl enc -aes-256-cbc -d \
    -in "${VERIFY_FILE}" \
    -out "${VERIFY_FILE%.enc}" \
    -pass "env:ENCRYPTION_KEY"
  gzip -t "${VERIFY_FILE%.enc}" && echo "  ✅ Integrity check passed"
else
  gzip -t "${VERIFY_FILE}" && echo "  ✅ Integrity check passed"
fi

# ── Cleanup ───────────────────────────────────────────────────

rm -rf "${TEMP_DIR}"

# ── Summary ───────────────────────────────────────────────────

echo ""
echo "═══════════════════════════════════════════════════"
echo "  ✅ Backup complete"
echo "  File:      ${BACKUP_FILE}"
echo "  Size:      ${BACKUP_SIZE}"
echo "  Location:  ${S3_BUCKET}/daily/${BACKUP_FILE}"
echo "  Timestamp: ${TIMESTAMP}"
echo "═══════════════════════════════════════════════════"

# ── Notify on success / failure ───────────────────────────────

if [[ -n "${SLACK_WEBHOOK:-}" ]]; then
  curl -s -X POST "${SLACK_WEBHOOK}" \
    -H "Content-Type: application/json" \
    -d "{\"text\":\"✅ Lumorius DB backup completed: \`${BACKUP_FILE}\` (${BACKUP_SIZE}) at ${TIMESTAMP}\"}" \
    > /dev/null || true
fi
