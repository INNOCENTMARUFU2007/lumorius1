# CCPA / CPRA Compliance Readiness Assessment
**Organization:** INMARTECH PVT LTD  
**Applicable Law:** California Consumer Privacy Act (CCPA) as amended by CPRA  
**Date:** June 2026

**Readiness: 82%** 🟢

---

## Applicability Assessment

Lumorius AI processes personal information of California residents through:
- Business customer employees using the platform
- California-based organizations subscribing to Lumorius AI

INMARTECH meets CCPA thresholds if annual gross revenue > $25M or processes data of 100,000+ consumers.

---

## Consumer Rights Implementation

| Right | CCPA Requirement | Status | Implementation |
|-------|-----------------|--------|---------------|
| Right to Know | Disclose categories/purposes of PI collected | ✅ | Privacy Policy; in-app dashboard |
| Right to Delete | Delete personal information upon request | ✅ | `/api/v1/gdpr/delete` endpoint |
| Right to Correct | Correct inaccurate personal information | ✅ | Profile settings; support request |
| Right to Opt-Out | Opt out of sale/sharing of PI | ✅ | Privacy Policy; "Do Not Sell" link |
| Right to Limit | Limit use of sensitive PI | ⚠️ | Policy exists; in-app flow pending |
| Right to Non-Discrimination | Not discriminate for exercising rights | ✅ | No discriminatory treatment |
| Right to Portability | Receive data in portable format | ✅ | JSON/CSV export |

---

## Privacy Notice Requirements

| Requirement | Status | Notes |
|------------|--------|-------|
| Notice at collection | ✅ | Registration form disclosure |
| Categories of PI collected | ✅ | Privacy Policy Section 2 |
| Purposes of collection | ✅ | Privacy Policy Section 3 |
| Retention periods | ⚠️ | Add explicit retention table to Privacy Policy |
| Do Not Sell/Share link | ✅ | Footer of web application |
| Sensitive PI disclosure | ✅ | AI Usage Policy prohibits sensitive PI |
| Annual privacy policy update | ✅ | Reviewed and dated |

---

## Data Mapping for CCPA

| Category of PI | Business Purpose | Shared With | Sold? |
|---------------|-----------------|-------------|-------|
| Identifiers (name, email, IP) | Account management | Sub-processors only | No |
| Commercial information (subscription) | Billing | Stripe | No |
| Internet/electronic activity (usage logs) | Analytics, security | Sentry, Prometheus | No |
| Professional information (job title, org) | Platform personalization | None | No |
| Geolocation (coarse; from IP) | Security, fraud detection | None | No |
| AI-generated content (meeting notes, docs) | Core platform service | OpenAI (in-transit) | No |

**Lumorius does not sell personal information.**

---

## Service Provider Agreements

All third parties who process California personal data on behalf of INMARTECH are contracted as "Service Providers" with:
- ✅ Agreement prohibiting use outside specified business purpose
- ✅ Agreement prohibiting sale or further disclosure
- ✅ Cooperation with consumer rights requests

---

## Identified Gaps

| Gap | Priority | Target |
|-----|----------|--------|
| Add explicit retention periods table to Privacy Policy | Medium | Q3 2026 |
| Build in-app "Limit Use of Sensitive PI" toggle | Medium | Q4 2026 |
| Implement automated 45-day response tracking for consumer requests | Medium | Q4 2026 |
| Annual CCPA employee training | Low | Q4 2026 |

---

## Consumer Request Process

1. Requests submitted via: privacy@lumorius.com or in-app Settings → Privacy
2. Identity verification: email confirmation + account verification
3. Response deadline: 45 days (extendable by 45 days with notice)
4. Authorized agents accepted with written authorization + identity verification
5. No fee for requests (unless manifestly unfounded or excessive)

*Contact: privacy@lumorius.com | INMARTECH PVT LTD*
