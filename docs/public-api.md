# Lumorius Public API v1

The Lumorius Public API lets organisation-owned integrations read supported Lumorius data using an API key. All endpoints are versioned under `/api/v1/public`.

## Authentication

Send the API key in the `X-API-Key` HTTP header. Never put a key in browser code, a mobile app, a URL, screenshots, or source control. Store it in a backend secret manager or environment variable. The full key is shown only once when it is created; the database stores a bcrypt hash.

```bash
curl "https://YOUR-LUMORIUS-HOST/api/v1/public/health" \
  -H "X-API-Key: $LUMORIUS_API_KEY"
```

## Available endpoints

| Method | Endpoint | Required scope | Purpose |
|---|---|---|---|
| GET | `/api/v1/public/health` | Any valid key | Check API availability and key authentication |
| GET | `/api/v1/public/documents?limit=50` | `documents:read` | Read document metadata for the key's organisation |
| GET | `/api/v1/public/tasks?limit=50` | `tasks:read` | Read tasks for the key's organisation |
| GET | `/api/v1/public/projects?limit=50` | `projects:read` | Read projects for the key's organisation |

The first page omits `cursor`. For the next page, pass the `pagination.nextCursor` value as the `cursor` query parameter. Pages are cursor-based, with a maximum page size of 100. Document storage keys and other private storage references are not returned by the public API.

Example:

```bash
curl "https://YOUR-LUMORIUS-HOST/api/v1/public/documents?limit=50" \
  -H "X-API-Key: $LUMORIUS_API_KEY"
```

Successful responses use the standard Lumorius response envelope. The inner response contains `items` and `pagination`, for example:

```json
{
  "success": true,
  "data": {
    "items": [],
    "pagination": { "limit": 50, "nextCursor": null }
  }
}
```

## Scopes and isolation

Keys must have at least one explicit scope. Supported scopes are `documents:read`, `tasks:read`, and `projects:read`. Each endpoint checks its required scope. Each query filters on the organisation ID carried by the authenticated API-key record; callers cannot supply an organisation ID to select another tenant.

New keys should receive only the permissions they need. Existing keys with no scopes will be denied access to the scoped data endpoints until they are rotated or re-created with the required permissions.

## Rate limit

The default limit is 120 requests per API key per minute. Configure `PUBLIC_API_RATE_LIMIT_PER_MINUTE` to change it. Exceeding the limit returns HTTP `429`; retry after the next minute window. The limiter uses a shared PostgreSQL table, so the limit is consistent across API instances using the same database.

## Errors

- `400 Bad Request`: malformed cursor or invalid page size.
- `401 Unauthorized`: missing, invalid, expired, or revoked key.
- `403 Forbidden`: key lacks the scope required by an endpoint.
- `429 Too Many Requests`: per-key request limit exceeded.

Security audit events are recorded for key creation/revocation, scope denials, and rate-limit events. Successful key validation updates the key's `last_used_at` timestamp. Routine read requests are not individually inserted into the audit log to avoid unbounded audit-log write volume.

## Database migrations

Apply `010_public_api_rate_limits.sql` first. Apply `011_public_api_indexes.sql` with `psql -f` while not inside a transaction; its concurrent index creation is intentionally designed to reduce write blocking. Validate the resulting indexes on the target database before enabling customer traffic.

## Key handling and rotation

1. Create a named key in Security Centre and select the minimum scopes required.
2. Copy the secret once and store it server-side.
3. Send it only over HTTPS.
4. Create a replacement key before rotating production integrations; update the integration, verify it, then revoke the old key.
5. Revoke any key that may have been exposed. Revocation disables it for future requests.