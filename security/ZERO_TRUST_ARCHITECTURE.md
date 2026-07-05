# Zero Trust Architecture — Lumorius AI
**Version:** 1.0 · June 2026  
**Owner:** Chief Security Officer  
**Framework:** NIST SP 800-207 Zero Trust Architecture

---

## Principle: "Never Trust, Always Verify"

Lumorius AI implements a Zero Trust architecture across all layers. No network location, device, or user is inherently trusted. Every access request is authenticated, authorised, and logged regardless of origin — whether from outside or inside the corporate network.

---

## Core Tenets Applied to Lumorius AI

| NIST Tenet | Lumorius Implementation |
|-----------|----------------------|
| 1. All data sources and computing services are resources | Every microservice, DB, queue is treated as a separate resource requiring authentication |
| 2. All communication is secured regardless of network location | TLS 1.3 on all internal service communication; mutual TLS roadmap |
| 3. Access is per-session, not per-network | JWT with 15-min expiry; no persistent sessions based on network |
| 4. Access determined by dynamic policy | RBAC + org isolation; policy evaluated on every request |
| 5. Monitor and measure integrity of all owned/associated devices | Container security scanning; Kubernetes admission control |
| 6. Authentication and authorisation are dynamic and strictly enforced | JWT guard on every route; re-auth for sensitive actions (roadmap) |
| 7. Collect as much information as possible | Full audit logging; distributed tracing (OTel + Jaeger); SIEM roadmap |

---

## Identity as the New Perimeter

### User Identity
- **Authentication:** JWT (15min access) + refresh token rotation
- **MFA:** TOTP enforced for admin/owner roles
- **SSO:** Google OAuth (GitHub/Microsoft roadmap)
- **Continuous verification:** Token expiry forces re-authentication every 15 minutes

### Service Identity (Internal)
- API-to-DB: Connection string with scoped user (no superuser)
- API-to-Redis: Password-authenticated, separate ACL per service
- CI/CD-to-Registry: Scoped deploy token; rotated per release
- CI/CD-to-Kubernetes: Scoped ServiceAccount; RBAC-limited

### Machine/API Identity
- API keys: hashed storage; per-org; rate-limited; scoped
- Vault: Service role-based secrets; dynamic DB credentials (roadmap)

---

## Network Segmentation (Kubernetes Implementation)

```
Internet ──► Cloudflare ──► NGINX Ingress ──► Services
                                   │
                     ┌─────────────┴─────────────┐
                     │                           │
              [lumorius namespace]          [monitoring namespace]
                     │                           │
         ┌───────────┼───────────┐               │
         │           │           │          prometheus/grafana
      api pod     web pod    worker pod
         │           │           │
         └───────────┴───────────┘
                     │
         [database namespace] ── Postgres
         [cache namespace]    ── Redis
```

### Network Policies (Kubernetes NetworkPolicy)
- API pods: allow ingress from Ingress only; allow egress to DB, Redis, external HTTPS
- Worker pods: allow ingress from Redis only; allow egress to OpenAI, S3, email
- DB pods: allow ingress from API + Worker namespaces only; no egress
- Prometheus: allow ingress from Grafana only; egress to scrape targets only
- Default: **deny all** (whitelist-only model)

---

## Device Trust

### Current State
- Corporate devices: endpoint protection required (MDM policy)
- Contractor devices: approved laptop list; disk encryption required
- No BYOD for production access

### Roadmap (Q4 2026)
- Certificate-based device authentication
- Device compliance check before token issuance (MDM integration)
- Conditional access: block login from unmanaged devices on admin accounts

---

## Data Access Controls

### Principle of Least Privilege
- Each service has minimum DB permissions (SELECT on its tables only; no DROP/ALTER)
- DB connection strings scoped to the service's schema
- Redis ACL: each service can only access its own key prefix
- S3 bucket policies: per-service prefix; no cross-service read

### Multi-Tenancy Isolation (Critical)
Every database query is filtered by `organization_id`:
```sql
-- Example: tasks query always includes org filter
SELECT * FROM tasks
WHERE organization_id = $1  -- enforced by RBAC middleware
AND id = $2;
```
This prevents horizontal data exposure between tenants even if a JWT is compromised.

### Encryption
- At rest: AES-256 (managed disk encryption + application-level for PII fields)
- In transit: TLS 1.3 minimum
- Key management: Vault (AWS KMS auto-unseal in production)
- Backup encryption: AES-256-CBC with Vault-managed key

---

## Microsegmentation of Services

| Service | Inbound Allowed From | Outbound Allowed To |
|---------|---------------------|---------------------|
| NGINX Ingress | Cloudflare IP ranges | API, Web |
| NestJS API | NGINX only | Postgres, Redis, OpenAI, S3, Postmark, Sentry |
| Next.js Web | NGINX only | NestJS API only |
| Bull Workers | Redis only | OpenAI, S3, Postmark |
| Postgres | API, Workers only | None |
| Redis | API, Workers only | None |
| Prometheus | Grafana | API metrics endpoint, Node Exporter |

---

## Continuous Monitoring and Logging

### What is Logged (Everything)
- Every API request: method, path, user, org, IP, latency, status
- Every authentication event: login, logout, failed attempts, MFA
- Every access control decision: grants and denials
- Every data modification: creates, updates, deletes (audit_logs table)
- Every AI request: prompt hash, model, token count, latency
- Every infrastructure change: Kubernetes audit log, Terraform plan

### Anomaly Detection (Current)
- AlertManager rules for failed login spikes
- AlertManager rules for unusual API error rates
- Sentry for application exceptions
- Manual review of audit logs

### Anomaly Detection (Roadmap Q4 2026)
- ML-based geographic anomaly detection (impossible travel)
- Automated IP reputation blocking
- UEBA (User and Entity Behaviour Analytics) integration
- SIEM connector (Splunk or Elastic SIEM)

---

## Zero Trust Maturity Assessment

| Pillar | Current Maturity | Target |
|--------|-----------------|--------|
| Identity | Traditional → Advanced | Advanced |
| Devices | Traditional | Advanced (Q4 2026) |
| Networks | Traditional → Advanced | Optimal (2027) |
| Applications | Traditional → Advanced | Advanced |
| Data | Traditional → Advanced | Optimal (2027) |
| Visibility/Analytics | Traditional → Advanced | Optimal (2027) |
| Automation/Orchestration | Traditional | Advanced (Q4 2026) |

*Maturity levels: Traditional → Advanced → Optimal (CISA Zero Trust Maturity Model)*

---

*INMARTECH PVT LTD · security@lumorius.com · Confidential*
