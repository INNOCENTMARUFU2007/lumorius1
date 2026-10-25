CREATE TABLE IF NOT EXISTS integration_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  provider text NOT NULL,
  status text NOT NULL DEFAULT 'connected' CHECK (status IN ('connected', 'error')),
  account_email text,
  encrypted_credentials text NOT NULL,
  scopes text[] NOT NULL DEFAULT ARRAY[]::text[],
  connected_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT integration_connections_org_provider_unique UNIQUE (organization_id, provider)
);

CREATE INDEX IF NOT EXISTS integration_connections_org_idx
  ON integration_connections (organization_id, provider);

CREATE TABLE IF NOT EXISTS integration_oauth_states (
  state_hash text PRIMARY KEY,
  provider text NOT NULL,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS integration_oauth_states_expiry_idx
  ON integration_oauth_states (expires_at);