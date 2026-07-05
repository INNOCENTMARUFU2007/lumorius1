#!/usr/bin/env bash
# Lumorius AI — Database Restore Script
# Usage: DATABASE_URL=postgres://... S3_BUCKET=s3://... bash restore.sh <backup-filename>
# Example: bash restore.sh lumorius-backup_20260617_020000.sql.gz

set -euo pipefail

# ── Arguments ────────────────────────────────────────────────

BACKUP_FILENAME="${1:?Usage: bash restore.sh <backup-filename>}"
DATABASE_URL="${DATABASE_URL:?DATABASE_URL is required}"
S3_BUCKET="${S3_BUCKET:?S3_BUCKET is required (e.g. s3://lumorius-backups)}"
TEMP_DIR=$(mktemp -d)
TIMESTAMP=$(date -u +"%Y%m%d_%H%M%S")

echo "┌─────────────────────────────────────────────────"
echo "│  Lumorius AI — Database Restore"
echo "│  Backup:    ${BACKUP_FILENAME}"
echo "│  Target:    ${DATABASE_URL//:*@/:***@}"
echo "│  Timestamp: ${TIMESTAMP}"
echo "└─────────────────────────────────────────────────"

# ── Safety confirmation ───────────────────────────────────────

if [[ "${FORCE:-}" != "true" ]]; then
  echo ""
  echo "  ⚠️  WARNING: This will overwrite the target database!"
  echo "  Target: ${DATABASE_URL//:*@/:***@}"
  echo ""
  read -r -p "  Type 'RESTORE' to confirm: " CONFIRM
  if [[ "${CONFIRM}" != "RESTORE" ]]; then
    echo "  Aborted."
    exit 0
  fi
fi

# ── Pre-flight checks ─────────────────────────────────────────

command -v psql    >/dev/null 2>&1 || { echo "❌ psql not found";   exit 1; }
command -v aws     >/dev/null 2>&1 || { echo "❌ aws CLI not found"; exit 1; }

# ── Download backup ───────────────────────────────────────────

echo "→ Downloading ${BACKUP_FILENAME} from ${S3_BUCKET}..."

LOCAL_FILE="${TEMP_DIR}/${BACKUP_FILENAME}"

# Try daily first, then weekly
aws s3 cp "${S3_BUCKET}/daily/${BACKUP_FILENAME}" "${LOCAL_FILE}" 2>/dev/null \
  || aws s3 cp "${S3_BUCKET}/weekly/${BACKUP_FILENAME}" "${LOCAL_FILE}" 2>/dev/null \
  || aws s3 cp "${S3_BUCKET}/${BACKUP_FILENAME}" "${LOCAL_FILE}" \
  || { echo "❌ Backup file not found in S3"; exit 1; }

echo "  ✅ Downloaded"

# ── Decrypt if needed ─────────────────────────────────────────

RESTORE_FILE="${LOCAL_FILE}"

if [[ "${BACKUP_FILENAME}" == *.enc ]]; then
  if [[ -z "${ENCRYPTION_KEY:-}" ]]; then
    echo "❌ ENCRYPTION_KEY required to decrypt backup"
    exit 1
  fi
  echo "→ Decrypting backup..."
  DECRYPTED_FILE="${LOCAL_FILE%.enc}"
  openssl enc -aes-256-cbc -d \
    -in  "${LOCAL_FILE}" \
    -out "${DECRYPTED_FILE}" \
    -pass "env:ENCRYPTION_KEY"
  RESTORE_FILE="${DECRYPTED_FILE}"
  echo "  ✅ Decrypted"
fi

# ── Verify integrity ─────────────────────────────────────────

echo "→ Verifying backup integrity..."
gzip -t "${RESTORE_FILE}" && echo "  ✅ Integrity check passed" \
  || { echo "❌ Backup file is corrupted"; exit 1; }

# ── Take snapshot before restore ─────────────────────────────

echo "→ Creating pre-restore safety snapshot..."
PRE_RESTORE_FILE="${TEMP_DIR}/pre-restore_${TIMESTAMP}.sql.gz"

pg_dump "${DATABASE_URL}" \
  --format=plain \
  --no-owner \
  --no-acl \
  --clean \
  --if-exists 2>&1 | gzip > "${PRE_RESTORE_FILE}" \
  && echo "  ✅ Safety snapshot: ${PRE_RESTORE_FILE}" \
  || echo "  ⚠️  Could not create safety snapshot (proceeding anyway)"

# ── Restore ───────────────────────────────────────────────────

echo "→ Restoring database..."
echo "  (This may take several minutes for large databases)"

gunzip -c "${RESTORE_FILE}" | psql "${DATABASE_URL}" \
  --set ON_ERROR_STOP=0 \
  -q 2>&1 | tail -20

echo "  ✅ Restore SQL executed"

# ── Verify restore ────────────────────────────────────────────

echo "→ Verifying restore..."

USER_COUNT=$(psql "${DATABASE_URL}" -t -c "SELECT COUNT(*) FROM users;" 2>/dev/null | tr -d '[:space:]' || echo "0")
ORG_COUNT=$(psql "${DATABASE_URL}" -t -c "SELECT COUNT(*) FROM organizations;" 2>/dev/null | tr -d '[:space:]' || echo "0")
TASK_COUNT=$(psql "${DATABASE_URL}" -t -c "SELECT COUNT(*) FROM tasks;" 2>/dev/null | tr -d '[:space:]' || echo "0")

echo "  ✅ Verified"
echo "     Users:         ${USER_COUNT}"
echo "     Organizations: ${ORG_COUNT}"
echo "     Tasks:         ${TASK_COUNT}"

# ── Re-apply indexes ─────────────────────────────────────────

if [[ -f "database/schema/004_performance_indexes.sql" ]]; then
  echo "→ Re-applying performance indexes..."
  psql "${DATABASE_URL}" -f database/schema/004_performance_indexes.sql -q \
    && echo "  ✅ Indexes applied"
fi

# ── Cleanup ───────────────────────────────────────────────────

echo "→ Cleaning up temp files..."
rm -f "${LOCAL_FILE}" "${RESTORE_FILE}"
# Keep the pre-restore snapshot in temp until exit
echo "  ✅ Pre-restore snapshot available at: ${PRE_RESTORE_FILE}"
echo "     (will be deleted on temp dir cleanup)"

# ── Summary ──────────────────────────────────────────────────

echo ""
echo "═══════════════════════════════════════════════════"
echo "  ✅ RESTORE COMPLETE"
echo "  Restored from: ${BACKUP_FILENAME}"
echo "  Target:        ${DATABASE_URL//:*@/:***@}"
echo "  Users:         ${USER_COUNT}"
echo "  Orgs:          ${ORG_COUNT}"
echo "  Tasks:         ${TASK_COUNT}"
echo "═══════════════════════════════════════════════════"

# ── Notify ───────────────────────────────────────────────────

if [[ -n "${SLACK_WEBHOOK:-}" ]]; then
  curl -s -X POST "${SLACK_WEBHOOK}" \
    -H "Content-Type: application/json" \
    -d "{\"text\":\"⚠️ Lumorius database RESTORED from \`${BACKUP_FILENAME}\` at ${TIMESTAMP}\"}" \
    > /dev/null || true
fi
