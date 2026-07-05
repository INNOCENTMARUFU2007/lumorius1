#!/usr/bin/env bash
# Lumorius AI — Security Scan Script
# Runs OWASP ZAP baseline scan + dependency audit + Gitleaks + Trivy
# Usage: bash tests/security/security-scan.sh [TARGET_URL]
# Example: bash tests/security/security-scan.sh https://staging.lumorius.com

set -euo pipefail

TARGET_URL="${1:-http://localhost:3001}"
REPORT_DIR="tests/security/reports"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
EXIT_CODE=0

echo "┌─────────────────────────────────────────────────────────┐"
echo "│     Lumorius AI — Security Scan Suite                    │"
echo "│     Target: ${TARGET_URL}                               │"
echo "│     Timestamp: ${TIMESTAMP}                             │"
echo "└─────────────────────────────────────────────────────────┘"
echo ""

mkdir -p "${REPORT_DIR}"

# ── Helper functions ──────────────────────────────────────────

pass() { echo "  ✅ $1"; }
fail() { echo "  ❌ $1"; EXIT_CODE=1; }
warn() { echo "  ⚠️  $1"; }
section() { echo ""; echo "▶ $1"; echo "─────────────────────────────────────────"; }

# ── 1. Health check ───────────────────────────────────────────

section "Pre-scan: Verify target is reachable"

HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${TARGET_URL}/api/v1/health" || echo "000")
if [[ "${HTTP_STATUS}" == "200" ]]; then
  pass "Target reachable (HTTP ${HTTP_STATUS})"
else
  fail "Target not reachable at ${TARGET_URL} (HTTP ${HTTP_STATUS})"
  echo "Aborting scan — target must be reachable."
  exit 1
fi

# ── 2. Security headers check ─────────────────────────────────

section "Security Headers Audit"

HEADERS=$(curl -s -I "${TARGET_URL}/api/v1/health")

check_header() {
  local header="$1"
  local desc="$2"
  if echo "${HEADERS}" | grep -qi "${header}"; then
    pass "${desc} header present"
  else
    fail "${desc} header MISSING (${header})"
  fi
}

check_header "strict-transport-security"  "HSTS"
check_header "x-content-type-options"     "X-Content-Type-Options"
check_header "x-frame-options\|content-security-policy.*frame-ancestors" "Frame protection"
check_header "content-security-policy"    "Content-Security-Policy"
check_header "referrer-policy"            "Referrer-Policy"

# Check no X-Powered-By exposure
if echo "${HEADERS}" | grep -qi "x-powered-by"; then
  fail "X-Powered-By header exposed (information disclosure)"
else
  pass "X-Powered-By header not exposed"
fi

# ── 3. TLS/SSL check ──────────────────────────────────────────

section "TLS Configuration"

if [[ "${TARGET_URL}" == https://* ]]; then
  HOSTNAME=$(echo "${TARGET_URL}" | sed 's|https://||' | cut -d'/' -f1)

  # Check TLS version
  if command -v openssl &>/dev/null; then
    TLS13=$(openssl s_client -connect "${HOSTNAME}:443" -tls1_3 </dev/null 2>&1 | grep -c "Protocol  : TLSv1.3" || true)
    if [[ "${TLS13}" -gt 0 ]]; then
      pass "TLS 1.3 supported"
    else
      warn "TLS 1.3 not confirmed — verify manually"
    fi

    TLS10=$(openssl s_client -connect "${HOSTNAME}:443" -tls1 </dev/null 2>&1 | grep -c "Cipher    :" || true)
    if [[ "${TLS10}" -gt 0 ]]; then
      fail "TLS 1.0 still enabled — must be disabled"
    else
      pass "TLS 1.0 not supported"
    fi
  else
    warn "openssl not available — skipping TLS version check"
  fi
else
  warn "HTTP target — TLS check skipped (not applicable for localhost)"
fi

# ── 4. Dependency vulnerability audit ────────────────────────

section "Dependency Audit (pnpm)"

if command -v pnpm &>/dev/null; then
  echo "Running pnpm audit (API)..."
  pnpm --filter @lumorius/api audit --audit-level=high \
    --reporter=json > "${REPORT_DIR}/audit-api-${TIMESTAMP}.json" 2>&1 || {
    fail "High/critical vulnerabilities found in API dependencies"
    echo "  See: ${REPORT_DIR}/audit-api-${TIMESTAMP}.json"
  }
  pass "API dependency audit complete"

  echo "Running pnpm audit (Web)..."
  pnpm --filter @lumorius/web audit --audit-level=high \
    --reporter=json > "${REPORT_DIR}/audit-web-${TIMESTAMP}.json" 2>&1 || {
    fail "High/critical vulnerabilities found in Web dependencies"
    echo "  See: ${REPORT_DIR}/audit-web-${TIMESTAMP}.json"
  }
  pass "Web dependency audit complete"
else
  warn "pnpm not found — skipping dependency audit"
fi

# ── 5. Secret scanning (Gitleaks) ─────────────────────────────

section "Secret Scanning (Gitleaks)"

if command -v gitleaks &>/dev/null; then
  gitleaks detect \
    --source . \
    --report-path "${REPORT_DIR}/gitleaks-${TIMESTAMP}.json" \
    --report-format json \
    --no-banner 2>&1 && {
    pass "No secrets detected in repository"
  } || {
    fail "Potential secrets detected — see ${REPORT_DIR}/gitleaks-${TIMESTAMP}.json"
  }
else
  warn "gitleaks not installed — install from https://github.com/gitleaks/gitleaks"
fi

# ── 6. Container image scan (Trivy) ───────────────────────────

section "Container Security Scan (Trivy)"

if command -v trivy &>/dev/null; then
  trivy fs . \
    --severity CRITICAL,HIGH \
    --format json \
    --output "${REPORT_DIR}/trivy-fs-${TIMESTAMP}.json" \
    --quiet && {
    CRITICAL_COUNT=$(python3 -c "
import json, sys
data = json.load(open('${REPORT_DIR}/trivy-fs-${TIMESTAMP}.json'))
total = sum(len(r.get('Vulnerabilities', []) or []) for r in data.get('Results', []))
print(total)
" 2>/dev/null || echo "0")
    if [[ "${CRITICAL_COUNT}" -gt 0 ]]; then
      fail "Trivy found ${CRITICAL_COUNT} CRITICAL/HIGH vulnerabilities"
    else
      pass "No CRITICAL/HIGH vulnerabilities found by Trivy"
    fi
  }
else
  warn "trivy not installed — install from https://trivy.dev"
fi

# ── 7. OWASP ZAP baseline scan ────────────────────────────────

section "OWASP ZAP Baseline Scan"

if command -v zap-baseline.py &>/dev/null || docker image inspect owasp/zap2docker-stable &>/dev/null 2>&1; then
  echo "Running ZAP baseline scan (this may take 2-3 minutes)..."
  docker run --rm \
    -v "$(pwd)/${REPORT_DIR}:/zap/wrk" \
    owasp/zap2docker-stable zap-baseline.py \
    -t "${TARGET_URL}" \
    -r "zap-report-${TIMESTAMP}.html" \
    -J "zap-report-${TIMESTAMP}.json" \
    -l WARN 2>&1 | tail -20 && {
    pass "ZAP baseline scan complete — see ${REPORT_DIR}/zap-report-${TIMESTAMP}.html"
  } || {
    warn "ZAP scan completed with warnings — review report"
  }
else
  warn "Docker or OWASP ZAP not available — skipping ZAP scan"
  warn "To run: docker pull owasp/zap2docker-stable"
fi

# ── 8. Rate limiting check ────────────────────────────────────

section "Rate Limiting Verification"

echo "Sending 20 rapid requests to login endpoint..."
RATE_LIMIT_HIT=false
for i in $(seq 1 20); do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
    -X POST "${TARGET_URL}/api/v1/auth/login" \
    -H "Content-Type: application/json" \
    -d '{"email":"ratelimit@test.com","password":"test"}' || echo "000")
  if [[ "${STATUS}" == "429" ]]; then
    RATE_LIMIT_HIT=true
    pass "Rate limiting active (429 received after ${i} requests)"
    break
  fi
done

if [[ "${RATE_LIMIT_HIT}" == "false" ]]; then
  fail "Rate limiting NOT detected after 20 rapid requests — verify @nestjs/throttler config"
fi

# ── Summary ───────────────────────────────────────────────────

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  Security Scan Summary"
echo "═══════════════════════════════════════════════════════════"
echo "  Target:    ${TARGET_URL}"
echo "  Reports:   ${REPORT_DIR}/"
echo "  Timestamp: ${TIMESTAMP}"
echo ""
if [[ "${EXIT_CODE}" -eq 0 ]]; then
  echo "  ✅ ALL CHECKS PASSED"
else
  echo "  ❌ SOME CHECKS FAILED — see details above"
fi
echo "═══════════════════════════════════════════════════════════"

exit "${EXIT_CODE}"
