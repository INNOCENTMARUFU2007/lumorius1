# SOC 2 Type I/II Readiness Assessment
**Organization:** INMARTECH PVT LTD  
**Service:** Lumorius AI Enterprise Platform  
**Date:** June 2026  
**Target:** SOC 2 Type I (Q4 2026) → Type II (Q2 2027)

**Type I Readiness: 71%** 🟡  
**Type II Readiness: 55%** 🔴 (12-month evidence collection required)

---

## Trust Services Criteria (TSC) Assessment

### CC1 — Control Environment

| Criterion | Requirement | Status | Evidence |
|-----------|-------------|--------|---------|
| CC1.1 | Board oversight of security | ⚠️ | No formal board; founding team oversight | Formalize governance committee |
| CC1.2 | Organizational structure for security | ✅ | Defined RACI; Security Policy |
| CC1.3 | Competent personnel | ✅ | Background checks; security training |
| CC1.4 | Performance evaluation includes security | ⚠️ | Informal only | Formalize in HR process |
| CC1.5 | Accountability for internal control | ✅ | Roles defined in Security Policy |

### CC2 — Communication and Information

| Criterion | Requirement | Status | Evidence |
|-----------|-------------|--------|---------|
| CC2.1 | Information quality for internal control | ✅ | Audit logs; monitoring dashboards |
| CC2.2 | Communicate to internal parties | ✅ | Security training; documented policies |
| CC2.3 | Communicate to external parties | ✅ | Privacy Policy; SLA; Security page |

### CC3 — Risk Assessment

| Criterion | Requirement | Status | Gap |
|-----------|-------------|--------|-----|
| CC3.1 | Risk identification objectives | ⚠️ | Informal | **GAP: Formal risk register** |
| CC3.2 | Risk analysis | ⚠️ | Threat model exists | **GAP: Quantitative risk assessment** |
| CC3.3 | Fraud risk assessment | ❌ | Not completed | **GAP: Annual fraud risk assessment** |
| CC3.4 | Change management risk | ✅ | PR reviews; CI/CD gates |

### CC4 — Monitoring

| Criterion | Requirement | Status | Evidence |
|-----------|-------------|--------|---------|
| CC4.1 | Ongoing monitoring | ✅ | Prometheus, AlertManager, Sentry |
| CC4.2 | Evaluate and communicate deficiencies | ⚠️ | Manual process | Automate deficiency tracking |

### CC5 — Control Activities

| Criterion | Requirement | Status | Evidence |
|-----------|-------------|--------|---------|
| CC5.1 | Mitigate risks through controls | ✅ | OWASP controls; RBAC; encryption |
| CC5.2 | Technology controls | ✅ | CI/CD; IaC; automated testing |
| CC5.3 | Policy deployment | ✅ | Policies published; employee training |

### CC6 — Logical and Physical Access Controls

| Criterion | Requirement | Status | Evidence |
|-----------|-------------|--------|---------|
| CC6.1 | Limit logical access | ✅ | RBAC; MFA; least privilege |
| CC6.2 | Authenticate users | ✅ | JWT + MFA; bcrypt passwords |
| CC6.3 | Authorize access | ✅ | Role guards; API key scoping |
| CC6.4 | Physical security | ✅ | Cloud-only; no physical servers |
| CC6.5 | Remove access (offboarding) | ⚠️ | Manual checklist | Automate via HR system |
| CC6.6 | Restrict access to change management | ✅ | Branch protection; required reviews |
| CC6.7 | Restrict third-party access | ✅ | Sub-processor agreements; scoped API keys |
| CC6.8 | Prevent unauthorized access (malware) | ✅ | Endpoint protection; dependency scanning |

### CC7 — System Operations

| Criterion | Requirement | Status | Evidence |
|-----------|-------------|--------|---------|
| CC7.1 | Detect configuration changes | ✅ | Kubernetes audit logs; Terraform state |
| CC7.2 | Monitor system components | ✅ | Prometheus; Loki; Grafana |
| CC7.3 | Evaluate security events | ✅ | AlertManager; Sentry; PagerDuty |
| CC7.4 | Respond to security incidents | ✅ | IRP documented and tested |
| CC7.5 | Identify and disclose breaches | ✅ | IRP; 72h notification target |

### CC8 — Change Management

| Criterion | Requirement | Status | Evidence |
|-----------|-------------|--------|---------|
| CC8.1 | Authorize, design, test changes | ✅ | PR reviews; CI gates; staging deploy |

### CC9 — Risk Mitigation

| Criterion | Requirement | Status | Evidence |
|-----------|-------------|--------|---------|
| CC9.1 | Identify and mitigate supply chain risks | ⚠️ | Dependabot; audits | Formalize vendor risk management |
| CC9.2 | Business partners | ✅ | Sub-processor DPAs; NDA |

---

## Identified Gaps — Priority Order

| Gap | Priority | Type Needed | Target |
|-----|----------|------------|--------|
| Formal risk register | High | Type I | Q3 2026 |
| Fraud risk assessment | High | Type I | Q3 2026 |
| Board/governance committee | High | Type I | Q3 2026 |
| Vendor risk management process | Medium | Type I | Q4 2026 |
| Automated offboarding workflow | Medium | Type II | Q4 2026 |
| Penetration test (CREST-certified) | High | Type I | Q3 2026 |
| 12 months of evidence collection | Required | Type II | Q2 2027 |

---

## Recommended SOC 2 Timeline

```
Q3 2026: Address Type I gaps; engage CPA firm; pen test
Q4 2026: Type I audit fieldwork (point-in-time)
Q4 2026: Type I report issued
Q4 2026: Begin 12-month Type II observation period
Q2 2027: Type II audit fieldwork
Q3 2027: Type II report issued
```

---

## Recommended Auditors
- Prescient Assurance (SOC 2 specialist)
- KPMG Zimbambwe
- Deloitte Zimbabwe
- A-LIGN (remote-first; startup-friendly)

*Contact: compliance@lumorius.com | INMARTECH PVT LTD*
