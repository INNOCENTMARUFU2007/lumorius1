CREATE TABLE IF NOT EXISTS public.api_key_rate_limits (
    api_key_id uuid PRIMARY KEY REFERENCES public.api_keys(id) ON DELETE CASCADE,
    window_start timestamptz NOT NULL,
    request_count integer NOT NULL DEFAULT 0 CHECK (request_count >= 0),
    updated_at timestamptz NOT NULL DEFAULT NOW()
);