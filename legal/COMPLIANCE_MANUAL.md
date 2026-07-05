# Compliance Manual — INMARTECH PVT LTD

**Version:** 1.0 · **Date:** June 19, 2026

## 1. Applicable Regulations
- GDPR (EU) — data protection for EU subjects
- CCPA (California) — consumer privacy rights
- SOC 2 Type II — security, availability, confidentiality
- ISO 27001 — information security management
- PCI DSS (if applicable) — payment card processing

## 2. Data Protection Officer
DPO designated. Contact: dpo@lumorius.com

## 3. GDPR Controls
- Lawful basis documented for each processing activity
- DSAR process: 30-day response SLA (automated via GDPR module)
- Data retention: configurable per org, enforced by nightly cron
- Breach notification: 72-hour supervisory authority obligation

## 4. SOC 2 Controls
- CC6: Logical access, MFA required for admin functions
- CC7: System operations, change management
- CC8: Change management, code review required
- A1: System availability, 99.9% SLA
- C1: Confidentiality, data classification

## 5. Audit Evidence Collection
- Access logs: retained 1 year (Loki)
- Change logs: retained 7 years (audit_logs table)
- Incident records: retained 5 years
- Evidence exported quarterly to secure S3 bucket

## 6. Annual Review
Compliance posture reviewed annually by external auditor.
