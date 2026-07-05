# Service Level Agreement (SLA)
**Provider:** INMARTECH PVT LTD  
**Service:** Lumorius AI Enterprise Platform  
**Version:** 1.0 · June 2026

---

## 1. Service Availability Commitment

| Tier | Uptime SLA | Monthly Downtime Budget |
|------|-----------|-------------------------|
| **Enterprise** | 99.9% | 43.8 minutes |
| **Professional** | 99.5% | 3.65 hours |
| **Starter** | 99.0% | 7.3 hours |

Uptime is measured on a calendar month basis, excluding Scheduled Maintenance.

---

## 2. Definitions

**"Downtime"** means the total accumulated minutes per month during which the production environment is unavailable, excluding Scheduled Maintenance and Excluded Events.

**"Scheduled Maintenance"** means maintenance performed during the weekly maintenance window (Sundays 02:00–04:00 IST) with at least 72 hours' prior notice via status.lumorius.com.

**"Excluded Events"** means unavailability caused by: (a) Customer's acts or omissions; (b) Force Majeure; (c) third-party services outside INMARTECH's control; (d) Customer's network or equipment issues; (e) Beta features.

**"Incident"** means an unplanned interruption or degradation of Service quality.

---

## 3. Incident Response Targets

| Severity | Definition | Initial Response | Status Update Frequency |
|----------|-----------|-----------------|------------------------|
| **P0 — Critical** | Complete service unavailability | 15 minutes | Every 30 minutes |
| **P1 — High** | Core feature unavailable; no workaround | 1 hour | Every 2 hours |
| **P2 — Medium** | Degraded performance; workaround available | 4 hours | Daily |
| **P3 — Low** | Minor issue; cosmetic or edge case | 24 hours | Per resolution |

---

## 4. Support Channels

| Tier | Support Channel | Hours |
|------|----------------|-------|
| Enterprise | Dedicated Slack + email + phone | 24/7/365 |
| Professional | Email + Slack | Business hours (09:00–18:00 IST, Mon–Fri) |
| Starter | Email | Business hours |

**Emergency escalation:** oncall@lumorius.com · +263 775252465

---

## 5. Service Credits

If INMARTECH fails to meet the Uptime SLA in any calendar month, Customer is eligible for Service Credits:

| Actual Monthly Uptime | Credit |
|----------------------|--------|
| 99.0% – 99.9% (Enterprise) | 10% of monthly fee |
| 95.0% – 99.0% | 25% of monthly fee |
| 90.0% – 95.0% | 50% of monthly fee |
| Below 90.0% | 100% of monthly fee |

**Credit Conditions:**
- Customer must submit a credit request within 30 days of the affected month end.
- Credits are applied to future invoices; no cash refunds.
- Credits are the sole remedy for SLA failures unless caused by gross negligence or wilful misconduct.
- Maximum aggregate credits in any 12-month period: 100% of annual subscription fee.

---

## 6. How to Report Downtime

1. Email: support@lumorius.com with subject: `[DOWNTIME] <description>`  
2. Slack: #lumorius-support channel (Enterprise customers)  
3. Status page: status.lumorius.com  

Include: time of first occurrence, affected services, user count impacted, and any error messages observed.

---

## 7. Planned Capacity and Performance Targets

| Metric | Target |
|--------|--------|
| API p50 response time | < 100 ms |
| API p95 response time | < 500 ms |
| API p99 response time | < 2,000 ms |
| Document indexing (per MB) | < 60 seconds |
| AI response (first token) | < 3 seconds |
| Dashboard load time | < 2 seconds |
| Data export availability | 99.5% |

---

## 8. Backup and Recovery

| Item | Target |
|------|--------|
| Backup frequency | Daily (incremental); Weekly (full) |
| Backup retention | 30 days |
| Recovery Point Objective (RPO) | 24 hours |
| Recovery Time Objective (RTO) | 4 hours |
| Geographic redundancy | Multi-AZ within primary region |

---

## 9. Status Communication

- **Status page:** status.lumorius.com (real-time)
- **Incident notifications:** Email + Slack for P0/P1
- **Post-incident reports:** Published within 5 business days for P0 incidents
- **Monthly uptime report:** Available in Customer's admin dashboard

---

## 10. Exclusions

This SLA does not apply to:
- Features in Beta or Preview designation
- Professional Services or implementation work
- Third-party integrations not operated by INMARTECH
- Periods of suspension due to payment default

---

*INMARTECH PVT LTD · support@lumorius.com · status.lumorius.com*
