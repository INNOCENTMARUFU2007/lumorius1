# Lumorius AI — Security Policy

**Maintained by:** INMARTECH PVT LTD  
**Last Updated:** June 17, 2026  
**Contact:** security@lumorius.com

---

## Our Security Commitment

Lumorius processes confidential business data including documents, meeting recordings, KPIs, and strategic information. Security is not an afterthought — it is built into every layer of the platform. We are committed to responsible disclosure and work with the security community to ensure the safety of our users.

---

## Reporting a Vulnerability

If you discover a security vulnerability in Lumorius, please report it responsibly. **Do not disclose vulnerabilities publicly until we have had an opportunity to address them.**

### How to Report

1. **Email:** security@lumorius.com  
   Encrypt sensitive reports with our PGP key (available at https://lumorius.com/.well-known/security.txt)

2. **Include in your report:**
   - Description of the vulnerability and potential impact
   - Steps to reproduce (proof of concept)
   - Affected components, endpoints, or versions
   - Your suggested severity (Critical / High / Medium / Low)
   - Your name/handle for acknowledgement (optional)

3. **Response timeline:**

| Step | Target Time |
|---|---|
| Acknowledgement of report | 24 hours |
| Initial severity assessment | 72 hours |
| Status update | Every 7 days |
| Critical / High fix deployment | 7–14 days |
| Medium fix deployment | 30 days |
| Low fix deployment | 90 days |

---

## Scope

### In Scope

- Lumorius web application (app.lumorius.com)
- Lumorius REST API (api.lumorius.com)
- Lumorius mobile application (iOS / Android)
- Authentication and authorization flows
- Data processing pipelines (document indexing, meeting processing)
- API keys and token management

### Out of Scope

- Third-party services (OpenAI, Stripe, AWS S3, etc.)
- Social engineering attacks against employees
- Physical security
- Denial of service / volumetric attacks
- Issues in outdated browsers not supported by the Service
- Vulnerabilities requiring physical access to a user's device

---

## Responsible Disclosure Rules

By submitting a vulnerability, you agree to:

- Give us reasonable time to fix the issue before public disclosure
- Not exploit the vulnerability to access, modify, or delete data you don't own
- Not perform testing that degrades service availability
- Not engage in social engineering of Lumorius employees or users
- Not disclose the vulnerability to third parties before we've published a fix

In return, we commit to:

- Acknowledge your report promptly
- Keep you informed of our progress
- Not take legal action against good-faith security researchers who follow these rules
- Credit you in our security hall of fame (if you wish)

---

## Security Architecture

### Authentication
- **JWT tokens** with 15-minute expiry (RS256 asymmetric signing in production)
- **Refresh tokens** rotated on each use, stored hashed in DB, 7-day TTL
- **HTTP-only cookies** for session cookie (XSS protection)
- **Multi-factor authentication** (TOTP) available for all users
- **OAuth 2.0** integration with Google, GitHub, Microsoft
- **Magic links** for passwordless sign-in (15-minute single-use tokens)
- **Brute force protection**: 5 failed attempts → 30-minute account lockout
- **Session management**: all active sessions visible and revocable in Security settings

### API Security
- **Bearer JWT** required on all authenticated endpoints
- **API key authentication** with SHA-256 hashed storage (prefix-only display)
- **Rate limiting** at three levels: 20 req/s, 100 req/10s, 500 req/min
- **Input validation** via class-validator and Zod on all request bodies
- **CORS** restricted to configured allowed origins
- **Helmet.js** security headers (CSP, HSTS, X-Frame-Options, etc.)
- **HSTS** with max-age 63072000 + preload

### Data Protection
- **Encryption at rest**: AES-256 on database storage volumes
- **Encryption in transit**: TLS 1.3 minimum; TLS 1.2 deprecated
- **Password hashing**: bcrypt with cost factor 12
- **Vector embeddings**: stored in isolated pgvector instance, not exported
- **File uploads**: scanned for malware, type-checked, size-limited

### Infrastructure
- **Container isolation** per service component
- **Network policies** restrict inter-service communication
- **Secrets management**: no secrets in code, config loaded from env at runtime
- **Audit logging**: all auth events, admin actions, data exports logged with IP + user agent
- **Database**: row-level access via organization_id scoping on all queries

### Compliance
- GDPR — data export, deletion, consent management (see Privacy Policy)
- OWASP Top 10 addressed in design and code review
- Regular dependency audits (`pnpm audit`)
- Security-focused code review for all authentication and data access changes

---

## Bug Bounty

We do not currently operate a formal paid bug bounty program. However, we:

- Acknowledge researchers publicly (security hall of fame at lumorius.com/security/hall-of-fame) with their permission
- Offer Lumorius Pro subscriptions as a goodwill gesture for Critical / High severity findings

---

## Security Hall of Fame

We gratefully acknowledge the following researchers who have helped make Lumorius more secure:

*No submissions yet — be the first!*

---

## Contact

**Security Team:** security@lumorius.com  
**General inquiries:** support@lumorius.com  
**Legal / Compliance:** legal@lumorius.com  

INMARTECH PVT LTD  
https://lumorius.com
