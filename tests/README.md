# Lumorius AI — Test Suite

Comprehensive testing across unit, integration, E2E, load, and security layers.

---

## Structure

```
tests/
├── load/               # k6 load tests (spike, sustained, ramp)
│   └── k6-load-test.js
├── security/           # Security scan script (headers, TLS, ZAP, Trivy)
│   └── security-scan.sh
└── README.md           # This file
```

Unit, controller, and E2E specs live alongside the source:
```
apps/api/src/auth/       auth.service.spec.ts, auth.controller.spec.ts
apps/api/src/tasks/      tasks.service.spec.ts
apps/api/src/notifications/ notifications.service.spec.ts, notifications.controller.spec.ts
apps/api/src/ai/         ai.service.spec.ts
apps/api/src/billing/    billing.service.spec.ts
apps/api/test/           app.e2e-spec.ts, auth.e2e-spec.ts, tasks.e2e-spec.ts
```

---

## Test Inventory

| Suite | Cases | Coverage Area |
|-------|-------|---------------|
| `auth.service.spec.ts` | 33 | Register, login, MFA, sessions, tokens |
| `auth.controller.spec.ts` | 12 | Auth controller delegation |
| `tasks.service.spec.ts` | 20 | Tasks and projects CRUD |
| `notifications.service.spec.ts` | 10 | Notification creation and read state |
| `notifications.controller.spec.ts` | 10 | Notifications controller |
| `notification-email.service.spec.ts` | 22 | Email delivery |
| `ai.service.spec.ts` | 10 | AI chat, embeddings, RAG pipeline |
| `billing.service.spec.ts` | 8 | Stripe checkout, subscriptions |
| `app.e2e-spec.ts` | 7 | Health, security headers, error handling |
| `auth.e2e-spec.ts` | 18 | Full auth HTTP flows |
| `tasks.e2e-spec.ts` | 12 | Full tasks/projects HTTP flows |
| `k6-load-test.js` | — | 200 VU spike; p95/p99/error rate |
| `security-scan.sh` | — | Headers, TLS, deps, rate limiting, ZAP |

**Total unit/integration: 125+ cases**

---

## Running Tests

### Unit Tests (all)
```bash
pnpm --filter @lumorius/api run test
```

### Unit Tests (watch mode)
```bash
pnpm --filter @lumorius/api run test:watch
```

### Unit Tests (with coverage)
```bash
pnpm --filter @lumorius/api run test:cov
```

### E2E Tests
```bash
# Requires: running Postgres + Redis
DATABASE_URL=postgresql://lumorius:password@localhost:5432/lumorius_test \
REDIS_URL=redis://localhost:6379 \
  pnpm --filter @lumorius/api run test:e2e
```

### Test Database Setup
```bash
createdb lumorius_test
psql lumorius_test < database/schema/001_initial.sql
psql lumorius_test < database/schema/002_additional_tables.sql
psql lumorius_test < database/schema/003_gdpr_admin.sql
psql lumorius_test < database/schema/004_performance_indexes.sql
psql lumorius_test < database/seeds/001_billing_plans.sql
```

### Load Tests (k6)
```bash
# Install k6: https://k6.io/docs/getting-started/installation/
k6 run tests/load/k6-load-test.js --env BASE_URL=https://staging.lumorius.com

# With JSON output for reporting
k6 run tests/load/k6-load-test.js \
  --env BASE_URL=https://staging.lumorius.com \
  --out json=tests/load/results-$(date +%Y%m%d).json
```

### Security Scan
```bash
# Make executable (first time only)
chmod +x tests/security/security-scan.sh

# Run against local dev
bash tests/security/security-scan.sh http://localhost:3001

# Run against staging
bash tests/security/security-scan.sh https://staging.lumorius.com
```

---

## Load Test Thresholds

| Metric | Threshold |
|--------|-----------|
| HTTP p95 response time | < 500ms |
| HTTP p99 response time | < 2,000ms |
| Error rate | < 1% |
| Health check p95 | < 100ms |

---

## CI Integration

Tests run automatically via `.github/workflows/ci.yml`:

| Job | Trigger |
|-----|---------|
| Unit tests | Every PR |
| E2E tests | Every PR to `main` |
| Security scan | Weekly + every release |
| Load test | Release branches only |
