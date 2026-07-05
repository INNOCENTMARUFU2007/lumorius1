# HashiCorp Vault Configuration — Lumorius AI
# Production configuration for secret management

# ── Storage backend (Integrated Raft for HA) ──────────────────
storage "raft" {
  path    = "/vault/data"
  node_id = "lumorius-vault-01"

  retry_join {
    leader_api_addr = "https://vault-01.lumorius-internal:8200"
  }
  retry_join {
    leader_api_addr = "https://vault-02.lumorius-internal:8200"
  }
  retry_join {
    leader_api_addr = "https://vault-03.lumorius-internal:8200"
  }
}

# ── Listener ──────────────────────────────────────────────────
listener "tcp" {
  address            = "0.0.0.0:8200"
  cluster_address    = "0.0.0.0:8201"
  tls_cert_file      = "/vault/tls/vault.crt"
  tls_key_file       = "/vault/tls/vault.key"
  tls_min_version    = "tls13"
  tls_disable_client_certs = true
}

# ── Cluster ───────────────────────────────────────────────────
cluster_addr = "https://vault-01.lumorius-internal:8201"
api_addr     = "https://vault.lumorius-internal:8200"

# ── Seal (AWS KMS auto-unseal) ────────────────────────────────
seal "awskms" {
  region     = "ap-south-1"
  kms_key_id = "arn:aws:kms:ap-south-1:ACCOUNT_ID:key/KEY_ID"
}

# ── UI ────────────────────────────────────────────────────────
ui = true

# ── Telemetry ─────────────────────────────────────────────────
telemetry {
  prometheus_retention_time = "30s"
  disable_hostname          = true
}

# ── Logging ───────────────────────────────────────────────────
log_level  = "info"
log_format = "json"
