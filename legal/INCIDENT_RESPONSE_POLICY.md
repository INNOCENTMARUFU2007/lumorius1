# Incident Response Policy
**Organization:** INMARTECH PVT LTD  
**Version:** 1.0 · June 2026  
**Owner:** Chief Security Officer  
**Classification:** Internal / Customer-facing summary

---

## 1. Purpose

This policy defines INMARTECH's process for identifying, containing, eradicating, and recovering from security incidents affecting the Lumorius AI platform, and for communicating with affected customers.

---

## 2. Incident Classification

| Severity | Definition | Examples | Response Time |
|----------|-----------|---------|--------------|
| **P0 — Critical** | Confirmed breach of customer data; system-wide compromise | Database exfiltration, ransomware, credential theft | 15 min |
| **P1 — High** | Potential data exposure; significant service disruption | API key exposure, DDoS, authentication bypass | 1 hour |
| **P2 — Medium** | Limited exposure; contained security event | Failed intrusion attempt, unauthorized access attempt | 4 hours |
| **P3 — Low** | No exposure; policy violation; suspicious activity | Anomalous login from new location, config misconfiguration | 24 hours |

---

## 3. Incident Response Team

| Role | Responsibility |
|------|---------------|
| **Incident Commander (IC)** | Overall coordination; final decisions |
| **Security Lead** | Technical investigation and containment |
| **Engineering Lead** | System access, log analysis, hotfixes |
| **Customer Success Lead** | Customer communication |
| **Legal/Compliance Lead** | Regulatory notification decisions |
| **Executive Sponsor** | Board and investor communication (P0 only) |

**On-call rotation:** oncall@lumorius.com (PagerDuty: team-security)

---

## 4. Incident Response Phases

### Phase 1 — Detection & Triage (0–30 min for P0)
1. Alert received via: automated monitoring (Prometheus/AlertManager), customer report, employee report, third-party disclosure
2. On-call engineer acknowledges alert within 15 min (P0/P1)
3. Initial triage: confirm incident is real; classify severity
4. Invoke Incident Commander and assemble response team

### Phase 2 — Containment (30 min – 2 hours for P0)
1. Isolate affected systems (disable API keys, revoke sessions, network segmentation)
2. Preserve forensic evidence (snapshot logs, memory dumps where applicable)
3. Identify scope: which systems, data, and users are affected
4. Implement temporary mitigations to stop ongoing damage

### Phase 3 — Eradication (2–8 hours for P0)
1. Remove the threat actor / malicious code
2. Patch the exploited vulnerability
3. Reset all potentially compromised credentials
4. Verify no persistence mechanisms remain

### Phase 4 — Recovery (8–24 hours for P0)
1. Restore systems from clean backups if necessary
2. Re-enable services incrementally with enhanced monitoring
3. Conduct smoke tests to verify normal operation
4. Confirm with engineering lead before declaring recovery

### Phase 5 — Post-Incident Review (within 5 business days)
1. Root cause analysis (RCA)
2. Timeline reconstruction
3. Identify what went well and what to improve
4. Update runbooks, monitoring, and controls
5. Publish post-incident report (for P0/P1: externally; P2/P3: internally)

---

## 5. Customer Notification

| Scenario | Notification Timeline | Channel |
|---------|----------------------|---------|
| Confirmed Personal Data Breach (GDPR) | 72 hours to supervisory authority; "without undue delay" to customers | Email + Status page |
| P0 Service Outage | 15 minutes (initial); 30-min updates | Status page + Email + Slack |
| P1 Significant Event | 1 hour (initial) | Status page + Email |
| P2/P3 Resolved | Post-resolution summary | Email to affected customers |

**Notification template includes:**
- What happened
- When it was detected
- What data was affected
- What we did
- What customers should do
- Contact for questions: security@lumorius.com

---

## 6. Regulatory Notification

| Regulation | Authority | Deadline |
|-----------|-----------|---------|
| GDPR | Supervisory authority (ICO/CNIL/etc.) | 72 hours |
| UK GDPR | ICO | 72 hours |
| CCPA | N/A (customer notification) | "Expedient" |
| PDPA (India) | CERT-In | 6 hours (for critical incidents) |
| HIPAA | HHS | 60 days |

Legal Lead is responsible for all regulatory notifications with sign-off from the Incident Commander and CEO.

---

## 7. Evidence Preservation

7.1 All logs related to an incident must be preserved for a minimum of 12 months.

7.2 Log tampering is strictly prohibited. Logs should be immediately archived to a separate, write-protected storage location at incident detection.

7.3 Chain of custody must be maintained for any evidence that may be used in legal proceedings.

---

## 8. Communication Security

8.1 All incident communication must use encrypted channels (Signal or encrypted email) to avoid tipping off threat actors.

8.2 No details of an active incident may be posted on public Slack channels, social media, or unencrypted email until the Incident Commander authorizes public disclosure.

---

## 9. Annual Testing

9.1 INMARTECH conducts tabletop incident response exercises at least annually.

9.2 Results of exercises are used to update this policy and associated runbooks.

---

## 10. Related Documents

- Security Policy (`SECURITY.md`)
- Business Continuity Policy
- Disaster Recovery Policy
- Threat Model (`security/THREAT_MODEL.md`)

---

*Contact: security@lumorius.com | CSO · INMARTECH PVT LTD*
