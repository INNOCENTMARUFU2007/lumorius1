# Lumorius AI — Penetration Test Scope Definition
**Version:** 1.0 · June 2026  
**Owner:** Chief Security Officer  
**For:** External CREST/OSCP-certified testers

---

## Engagement Overview

| Field | Details |
|-------|---------|
| Scope type | Black box (initial) → Grey box (follow-up) |
| Target environment | Staging: staging.lumorius.com (dedicated pen-test instance) |
| Production testing | NOT permitted without separate written authorisation |
| Estimated duration | 5–7 business days |
| Expected deliverables | Executive summary + technical report + CVSS-scored findings + retest |

---

## In-Scope Systems

### Web Application
- `https://staging.lumorius.com` — Next.js web dashboard
- All authenticated and unauthenticated pages and flows

### REST API
- `https://staging.lumorius.com/api/v1/*` — NestJS API (all endpoints)
- Swagger documentation: `https://staging.lumorius.com/api/docs`

### Authentication and Authorization
- `/api/v1/auth/*` — full auth flow
- JWT token handling (issue, refresh, revoke)
- MFA/TOTP
- Password reset, magic links
- OAuth (Google) callback flow
- RBAC enforcement across all roles (owner, admin, member, viewer)

### API Endpoints (all roles)
- `/api/v1/tasks/*`
- `/api/v1/documents/*`
- `/api/v1/meetings/*`
- `/api/v1/notifications/*`
- `/api/v1/billing/*`
- `/api/v1/admin/*` (admin role required)
- `/api/v1/gdpr/*`
- `/api/v1/ai/*`
- `/api/v1/knowledge/*`
- `/api/v1/analytics/*`

### AI Features
- Prompt injection testing on all AI-powered endpoints
- Document RAG pipeline (test for data leakage across organisations)
- Meeting analysis endpoints

---

## Out-of-Scope Systems

- Production environment (`lumorius.com`) — NOT in scope
- Third-party systems (OpenAI, Postmark, Stripe, AWS) — test at interface only
- Physical security
- Social engineering / phishing
- Denial of Service attacks (simulated only, with prior approval)
- Source code review (separate engagement; not part of pen test)
- Employee workstations / endpoints

---

## Testing Methodologies

### 1. Reconnaissance
- Public DNS, certificate transparency, Shodan
- Web crawling and endpoint discovery
- JavaScript analysis for client-side secrets or endpoints

### 2. Authentication Testing
- [ ] Brute force protection (lockout mechanism)
- [ ] Password policy enforcement
- [ ] JWT algorithm confusion (`alg: none`, RS256→HS256)
- [ ] JWT secret strength
- [ ] Refresh token theft and replay
- [ ] Session fixation
- [ ] Concurrent session handling
- [ ] MFA bypass techniques
- [ ] OAuth redirect_uri manipulation
- [ ] Magic link replay / token reuse

### 3. Authorization Testing
- [ ] IDOR — access another org's data by manipulating IDs
- [ ] Privilege escalation (member → admin)
- [ ] Cross-tenant data access (most critical)
- [ ] API endpoint access without authentication
- [ ] RBAC bypass via HTTP method tampering
- [ ] Mass assignment vulnerabilities

### 4. Input Validation
- [ ] SQL injection (all parameters)
- [ ] XSS (stored, reflected, DOM)
- [ ] SSTI (server-side template injection)
- [ ] Command injection
- [ ] Path traversal (file upload/download)
- [ ] XML/JSON injection
- [ ] CRLF injection
- [ ] Prompt injection (AI endpoints)

### 5. Business Logic
- [ ] Rate limiting bypass
- [ ] Subscription/billing bypass (access paid features on free tier)
- [ ] Negative pricing or quantity manipulation
- [ ] Feature flag bypass
- [ ] GDPR deletion verification (data actually deleted)

### 6. Cryptography
- [ ] TLS configuration (version, cipher suites, certificate)
- [ ] Weak random number generation
- [ ] Key storage (no secrets in JS bundles, HTML, headers)
- [ ] Sensitive data in localStorage vs httpOnly cookies

### 7. Infrastructure
- [ ] Security headers completeness
- [ ] CORS misconfiguration
- [ ] CSP bypass techniques
- [ ] Exposed debug endpoints
- [ ] S3/storage bucket misconfiguration (if accessible)

### 8. File Upload
- [ ] MIME type bypass
- [ ] Malicious file execution
- [ ] File size limit bypass
- [ ] Zip bomb / decompression bomb
- [ ] SSRF via file fetch URL

---

## Test Accounts (to be provisioned by INMARTECH)

| Account | Role | Organisation |
|---------|------|-------------|
| pentest-owner@lumorius-pentest.com | Owner | PenTest Org A |
| pentest-admin@lumorius-pentest.com | Admin | PenTest Org A |
| pentest-member@lumorius-pentest.com | Member | PenTest Org A |
| pentest-viewer@lumorius-pentest.com | Viewer | PenTest Org A |
| pentest-other@lumorius-pentest.com | Owner | PenTest Org B (cross-tenant) |

---

## Rules of Engagement

1. **No production systems.** Testing on staging only.
2. **No destructive tests** without prior written approval (DB wipe, mass deletion).
3. **Immediate escalation** for critical findings affecting customer data — call security@lumorius.com before continuing.
4. **No public disclosure** — standard 90-day coordinated disclosure after remediation.
5. **Testing window:** Monday–Friday 09:00–18:00 IST (unless extended-hours testing approved).
6. **Source IP range:** Tester must provide source IP ranges in advance; INMARTECH will allowlist.
7. **Evidence:** Screenshot + PoC for all findings; no exfiltration of real customer data.

---

## Reporting Requirements

| Finding Severity | Report Within |
|-----------------|--------------|
| Critical (CVSS ≥ 9.0) | 24 hours (immediate call) |
| High (CVSS 7.0–8.9) | 48 hours |
| Medium (CVSS 4.0–6.9) | Final report |
| Low / Informational | Final report |

Report format: Executive summary + Technical findings (CVSS v3.1 scored) + Reproduction steps + Remediation recommendations + Retest results.

---

*Contact: security@lumorius.com · CSO · INMARTECH PVT LTD*
