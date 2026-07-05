# GDPR Compliance Readiness Assessment
**Organization:** INMARTECH PVT LTD  
**Service:** Lumorius AI Enterprise Platform  
**Date:** June 2026  
**Assessor:** Compliance Team

**Overall Readiness: 78%** 🟡

---

## Article-by-Article Gap Analysis

### Chapter II — Principles (Articles 5–11)

| Article | Requirement | Status | Evidence |
|---------|-------------|--------|---------|
| Art. 5 | Lawfulness, fairness, transparency | ✅ | Privacy Policy; DPA; consent flows |
| Art. 6 | Lawful basis for processing | ✅ | Contract (Art.6.1.b); Legitimate interest (Art.6.1.f) |
| Art. 7 | Conditions for consent | ✅ | Explicit consent checkboxes; withdrawal mechanism |
| Art. 9 | Special category data | ✅ | Prohibited by AI Usage Policy |
| Art. 11 | Processing not requiring identification | ✅ | Anonymisation for analytics |

### Chapter III — Data Subject Rights (Articles 12–23)

| Article | Right | Status | Implementation | Gap |
|---------|-------|--------|---------------|-----|
| Art. 15 | Right of access | ✅ | `GET /api/v1/gdpr/export` | None |
| Art. 16 | Right to rectification | ✅ | Profile update in dashboard | None |
| Art. 17 | Right to erasure | ✅ | `POST /api/v1/gdpr/delete` | Verify AI conversation deletion |
| Art. 18 | Right to restriction | ⚠️ | Manual process only | Automate restriction flag in DB |
| Art. 20 | Right to portability | ✅ | JSON/CSV export endpoint | None |
| Art. 21 | Right to object | ⚠️ | Privacy Policy only | Add in-app objection workflow |
| Art. 22 | Automated decision-making | ✅ | AI Usage Policy; human override | None |

### Chapter IV — Controller and Processor (Articles 24–43)

| Article | Requirement | Status | Gap |
|---------|-------------|--------|-----|
| Art. 24 | Data controller responsibilities | ✅ | Policies in place | None |
| Art. 25 | Data protection by design | ✅ | RBAC, encryption, minimal data | None |
| Art. 28 | Processor agreements | ✅ | DPA signed with all sub-processors | Annual review needed |
| Art. 30 | Records of processing activities (ROPA) | ❌ | Not created | **GAP: Create ROPA document** |
| Art. 32 | Security of processing | ✅ | AES-256, TLS 1.3, RBAC, MFA | None |
| Art. 33 | Breach notification (supervisory authority) | ✅ | IRP: 72h target | Test with drill |
| Art. 34 | Breach notification (individuals) | ✅ | IRP includes customer notification | Test with drill |
| Art. 35 | Data Protection Impact Assessment (DPIA) | ⚠️ | AI features DPIA in progress | **GAP: Complete AI DPIA** |
| Art. 37 | Data Protection Officer (DPO) | ⚠️ | Not appointed | **GAP: Appoint DPO or justify exception** |
| Art. 40 | Codes of conduct | N/A | Not applicable | None |

---

## Identified Gaps and Remediation Plan

| Gap | Priority | Owner | Target Date |
|-----|----------|-------|-------------|
| Create ROPA (Record of Processing Activities) | High | Legal + Compliance | Q3 2026 |
| Complete AI feature DPIA | High | CTO + DPO | Q3 2026 |
| Appoint or designate DPO | High | CEO | Q3 2026 |
| Automate Art. 18 restriction flag | Medium | Engineering | Q4 2026 |
| Add in-app Art. 21 objection workflow | Medium | Product + Engineering | Q4 2026 |
| Annual sub-processor DPA review process | Low | Legal | Q1 2027 |

---

## Technical Controls (Implemented)

| Control | Implementation |
|---------|---------------|
| Data encryption at rest | AES-256; PostgreSQL encrypted volumes |
| Data encryption in transit | TLS 1.3 enforced; HSTS |
| Access control | RBAC; JWT with 15-min expiry; MFA |
| Audit logging | All data access logged in `audit_logs` table |
| Data export | `/api/v1/gdpr/export` — JSON format |
| Data deletion | `/api/v1/gdpr/delete` — cascading delete with 30-day retention window |
| Data minimisation | Only required fields collected; optional fields clearly marked |
| Consent management | Explicit checkboxes; withdrawal available in account settings |
| Cookie consent | Cookie Policy; banner with granular consent |
| Breach notification workflow | Documented in IRP; 72h target |

---

## Sub-processor Register

| Sub-processor | Country | Transfer Mechanism | DPA Status |
|--------------|---------|-------------------|-----------|
| OpenAI, LP | USA | SCCs (2021 EU) | ✅ Signed |
| Amazon Web Services | USA/EU | SCCs + BCRs | ✅ Signed |
| Sentry, Inc. | USA | SCCs | ✅ Signed |
| Postmark | USA | SCCs | ✅ Signed |
| Cloudflare | USA/EU | SCCs | ✅ Signed |

---

## Next Steps

1. Engage qualified DPO (external or internal)
2. Complete ROPA — expected: 4 weeks
3. Commission full AI DPIA — expected: 6 weeks
4. Schedule annual GDPR training for all staff
5. Commission external GDPR audit — Q4 2026

*Contact: privacy@lumorius.com | INMARTECH PVT LTD*
