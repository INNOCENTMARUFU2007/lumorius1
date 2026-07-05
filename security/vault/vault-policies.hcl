# HashiCorp Vault Policies — Lumorius AI
# Apply with: vault policy write <policy-name> <file>

# ── lumorius-api: production API server ───────────────────────
# vault policy write lumorius-api vault-policies.hcl (api section)

path "secret/data/lumorius/production/*" {
  capabilities = ["read"]
}

path "secret/data/lumorius/production/database" {
  capabilities = ["read"]
}

path "secret/data/lumorius/production/jwt" {
  capabilities = ["read"]
}

path "secret/data/lumorius/production/openai" {
  capabilities = ["read"]
}

path "secret/data/lumorius/production/email" {
  capabilities = ["read"]
}

path "secret/data/lumorius/production/oauth" {
  capabilities = ["read"]
}

# ── lumorius-api-staging: staging API server ──────────────────

path "secret/data/lumorius/staging/*" {
  capabilities = ["read"]
}

# ── lumorius-ci: CI/CD pipeline (GitHub Actions) ──────────────
# Only allowed to read deployment secrets, not rotate them

path "secret/data/lumorius/production/registry" {
  capabilities = ["read"]
}

path "secret/data/lumorius/production/k8s-deploy" {
  capabilities = ["read"]
}

path "secret/data/lumorius/staging/registry" {
  capabilities = ["read"]
}

# ── lumorius-admin: DevOps / SRE team ─────────────────────────

path "secret/data/lumorius/*" {
  capabilities = ["create", "read", "update", "delete", "list"]
}

path "secret/metadata/lumorius/*" {
  capabilities = ["list", "read", "delete"]
}

path "auth/token/create" {
  capabilities = ["create", "update"]
}

# ── lumorius-rotation: automated secret rotation ───────────────

path "secret/data/lumorius/production/database" {
  capabilities = ["create", "update"]
}

path "secret/data/lumorius/production/jwt" {
  capabilities = ["create", "update"]
}

path "database/creds/lumorius-api" {
  capabilities = ["read"]
}

# ── Audit log access (read-only) ─────────────────────────────

path "sys/audit" {
  capabilities = ["read"]
}

# ── PKI: TLS certificate issuance ─────────────────────────────

path "pki/issue/lumorius-internal" {
  capabilities = ["create", "update"]
}

path "pki/cert/*" {
  capabilities = ["read"]
}

# ── Secret paths reference ────────────────────────────────────
# secret/lumorius/production/database    → DATABASE_URL, DATABASE_POOL_SIZE
# secret/lumorius/production/jwt         → JWT_SECRET, JWT_REFRESH_SECRET
# secret/lumorius/production/openai      → OPENAI_API_KEY
# secret/lumorius/production/email       → SMTP_HOST, SMTP_USER, SMTP_PASSWORD
# secret/lumorius/production/oauth       → GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
# secret/lumorius/production/sentry      → SENTRY_DSN
# secret/lumorius/production/stripe      → STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET
# secret/lumorius/production/session     → SESSION_SECRET
