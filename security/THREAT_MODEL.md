# Lumorius AI — Threat Model
**Framework:** STRIDE  
**Version:** 1.0 · June 2026  
**Owner:** Chief Security Officer  
**Last Review:** June 2026

---

## System Overview

Lumorius AI is a multi-tenant SaaS platform. The attack surface includes:
- Public REST API (NestJS on Kubernetes)
- Next.js web application (served via CDN)
- PostgreSQL database (with pgvector)
- Redis (session cache, job queue)
- Bull job queues (document processing, meetings)
- Third-party AI APIs (OpenAI)
- Email delivery (Postmark)
- GitHub Container Registry (image storage)

---

## Trust Boundaries

```
[Internet]
    │
    ▼
[Cloudflare WAF/CDN]
    │
    ▼
[Kubernetes Ingress / NGINX]
    │
    ├──► [Web App — Next.js]   (public)
    │
    └──► [API — NestJS]        (JWT-protected)
              │
              ├──► [PostgreSQL + pgvector]  (private subnet)
              ├──► [Redis]                  (private subnet)
              └──► [OpenAI API]             (egress only)
```

---

## STRIDE Analysis

### S — Spoofing

| Threat | Likelihood | Impact | Control |
|--------|-----------|--------|---------|
| JWT token forging | Low | Critical | RS256/HS256 with strong secret; short TTL (15min) |
| Refresh token theft | Medium | High | HttpOnly cookie (roadmap); token rotation on use |
| OAuth state parameter forgery | Low | High | CSRF state param; PKCE |
| API key brute-forcing | Medium | High | Hashed storage; rate limiting; lockout |
| Account takeover via password reset | Low | High | Token expiry; IP logging; anti-enumeration |
| Impersonating service account | Low | Critical | No shared service accounts; IAM per-service |

### T — Tampering

| Threat | Likelihood | Impact | Control |
|--------|-----------|--------|---------|
| SQL injection | Low | Critical | Parameterised queries everywhere; no string interpolation |
| Request body tampering | Low | High | Global validation pipe (class-validator); schema validation |
| Database record modification | Low | Critical | RBAC; organization isolation; audit logs |
| Docker image tampering | Low | Critical | Image signing (roadmap); GHCR with access control |
| Kubernetes manifest tampering | Low | Critical | RBAC; GitOps (only CI/CD can apply manifests) |
| Prompt injection in AI features | Medium | High | System prompt hardening; input sanitisation; output validation |

### R — Repudiation

| Threat | Likelihood | Impact | Control |
|--------|-----------|--------|---------|
| User denies data access | Low | Medium | Comprehensive audit_logs table; immutable log entries |
| Admin denies configuration change | Low | Medium | Kubernetes audit logs; deployment annotations |
| AI output disputes | Medium | Medium | Responses logged with model version; source citations |

### I — Information Disclosure

| Threat | Likelihood | Impact | Control |
|--------|-----------|--------|---------|
| Database credentials exposure | Low | Critical | Vault/env secrets; no secrets in code/logs |
| API keys in logs | Low | High | Log sanitisation; key masking |
| Sensitive data in error responses | Low | High | Global exception filter; no stack traces in production |
| Meeting transcripts accessed cross-tenant | Low | Critical | organization_id isolation on every query |
| Vector embeddings revealing document content | Low | Medium | Embeddings stored per org; no cross-org search |
| OpenAI API key exposure | Low | Critical | Rotated secrets; Gitleaks in CI |
| JWT payload disclosure | Low | Low | Minimal claims; no PII in payload |
| Verbose HTTP headers | Low | Low | Helmet removes X-Powered-By etc. |

### D — Denial of Service

| Threat | Likelihood | Impact | Control |
|--------|-----------|--------|---------|
| DDoS on API | Medium | High | Cloudflare WAF; rate limiting (ThrottlerGuard) |
| Brute-force login | Medium | Medium | 5-attempt lockout; CAPTCHA (roadmap) |
| Large file upload abuse | Medium | Medium | File size limits; type validation |
| AI API cost exhaustion | Medium | High | Per-org token limits; spend alerts |
| Redis queue poisoning | Low | High | Internal-only Redis; no external access |
| Memory exhaustion via large requests | Low | Medium | Request size limits in NGINX |

### E — Elevation of Privilege

| Threat | Likelihood | Impact | Control |
|--------|-----------|--------|---------|
| Horizontal privilege escalation (cross-org data) | Low | Critical | organization_id on all queries; org guard middleware |
| Vertical privilege escalation (member → admin) | Low | Critical | Role guard on all admin endpoints |
| SSRF via document processor | Low | High | Whitelist of allowed download URLs; no internal URLs |
| Container breakout | Very Low | Critical | Non-root containers; read-only filesystem; seccomp |
| Kubernetes privilege escalation | Very Low | Critical | RBAC; PSA (Pod Security Admission) |

---

## High-Priority Mitigations (Roadmap)

| Priority | Mitigation | Target |
|----------|-----------|--------|
| 🔴 Critical | Implement HttpOnly + Secure cookie for refresh token (remove from localStorage) | Q3 2026 |
| 🔴 Critical | Add CAPTCHA to login after 3 failed attempts | Q3 2026 |
| 🟠 High | Image signing and verification in CI (Cosign) | Q3 2026 |
| 🟠 High | SSRF protection in document download (URL allowlist) | Q3 2026 |
| 🟠 High | Row-Level Security (RLS) in PostgreSQL as defence-in-depth | Q4 2026 |
| 🟡 Medium | SIEM integration for audit log streaming | Q4 2026 |
| 🟡 Medium | WebAuthn/Passkeys (eliminate password entirely) | Q4 2026 |
| 🟡 Medium | Automated anomaly detection (unusual login location) | Q1 2027 |

---

## Data Flow Diagram (simplified)

```
User Browser ──HTTPS──► Cloudflare ──► NGINX ──► NestJS API
                                                      │
                     ┌────────────────────────────────┤
                     │                                │
                 PostgreSQL                         Redis
               (org-isolated)              (sessions, queues)
                     │                                │
              AI Module                        Bull Workers
                  │                          (document, meeting)
              OpenAI API                            │
          (encrypted egress)                   OpenAI API
```

---

## Penetration Test Scope

See `security/PENETRATION_TEST_SCOPE.md` for the full scope definition.

---

*Classification: Internal — Confidential*  
*INMARTECH PVT LTD · security@lumorius.com*
