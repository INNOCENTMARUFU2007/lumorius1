# Disaster Recovery Policy
**Organization:** INMARTECH PVT LTD  
**Version:** 1.0 · June 2026  
**Owner:** Chief Technology Officer

---

## 1. Overview

This policy defines the technical procedures for restoring Lumorius AI platform services following a disaster — any event that causes, or threatens to cause, significant service disruption beyond the scope of routine incident response.

**Recovery objectives:**

| Tier | RTO | RPO |
|------|-----|-----|
| Production Database | 4 hours | 1 hour |
| API Services | 4 hours | 0 (stateless) |
| Web Application | 4 hours | 0 (stateless) |
| AI Processing | 2 hours | N/A |
| Monitoring | 2 hours | N/A |

---

## 2. DR Scenarios and Runbooks

### Scenario A — Single Availability Zone Failure

**Detection:** PagerDuty alert: `k8s.node_not_ready` for >3 nodes in same AZ  
**RTO:** 30 minutes  
**Actions:**
1. Kubernetes automatically reschedules pods to healthy AZ (auto)
2. Database replica promoted automatically by cloud provider
3. Verify health endpoint: `https://lumorius.com/api/v1/health`
4. Monitor for 15 minutes; update status page

### Scenario B — Full Region Failure

**Detection:** >50% of health checks failing for >5 minutes  
**RTO:** 4 hours  
**Actions:**
1. CTO declares regional DR event
2. DevOps: point DNS (Cloudflare) to secondary region
3. DevOps: spin up services in secondary region from Terraform
   ```bash
   cd infra/terraform
   terraform workspace select dr-region
   terraform apply -var="region=ap-south-2" -auto-approve
   ```
4. Restore database from latest cross-region backup
5. Deploy latest stable image from GHCR
6. Run smoke tests: `bash tests/smoke/smoke-test.sh`
7. Update DNS TTL, monitor for 30 minutes
8. Notify customers per SLA

### Scenario C — Database Corruption

**Detection:** Application errors with `relation does not exist`; DB health check failure  
**RTO:** 4 hours  
**Actions:**
1. Halt all writes: scale API deployment to 0 replicas
   ```bash
   kubectl scale deployment lumorius-api --replicas=0 -n lumorius
   ```
2. Identify last known good backup
   ```bash
   aws s3 ls s3://lumorius-backups/daily/ --recursive | sort | tail -10
   ```
3. Restore to new PostgreSQL instance
   ```bash
   bash database/backup/restore.sh <backup-filename>
   ```
4. Verify schema integrity
   ```bash
   psql $DATABASE_URL -f database/schema/verify.sql
   ```
5. Update `DATABASE_URL` secret in k8s
6. Scale API back up: `kubectl scale deployment lumorius-api --replicas=3 -n lumorius`
7. Run E2E smoke tests
8. Notify customers of data loss (if any, per RPO)

### Scenario D — Ransomware / Complete Compromise

**Detection:** CSO declares full compromise  
**RTO:** 24 hours  
**Actions:**
1. CSO + CEO: declare DR event; notify legal
2. Immediately: isolate all systems (revoke all cloud access keys)
3. Spin up fresh infrastructure in a clean cloud account from Terraform
4. Restore database from air-gapped offline backup (not connected to compromised infra)
5. Rebuild container images from source in CI (do not use existing registry)
6. Deploy fresh environment; do not restore any configuration from compromised systems
7. Engage CREST-certified forensics firm
8. Notify customers, regulators, and law enforcement per IRP

---

## 3. Backup Architecture

```
Production DB ──► Daily backup job (k8s CronJob)
                         │
                         ▼
               Encrypted S3 bucket (primary region)
                         │
              ┌──────────┴──────────┐
              ▼                     ▼
   Cross-region replica      Air-gapped offline copy
   (secondary region)        (monthly; manual transfer)
```

**Backup encryption:** AES-256 with AWS KMS or equivalent  
**Backup verification:** Automated integrity check + test restore monthly

---

## 4. Communication During DR

| Audience | Channel | Frequency | Owner |
|---------|---------|-----------|-------|
| Customers | status.lumorius.com + email | Every 30 min (P0) | Customer Success |
| Internal team | Slack #incident-room | Continuous | Incident Commander |
| Board / Investors | Direct call | At activation + resolution | CEO |
| Regulators | Secure email | Per regulatory requirement | Legal |

---

## 5. DR Test Schedule

| Test | Frequency | Last Tested | Owner |
|------|-----------|-------------|-------|
| Backup restore drill | Quarterly | TBD | DevOps Lead |
| AZ failover test | Quarterly | TBD | DevOps Lead |
| Regional failover | Annual | TBD | CTO |
| Full DR simulation | Annual | TBD | CTO + CSO |

---

## 6. Contact Directory

| Role | Name | Contact |
|------|------|---------|
| CTO (primary) | — | cto@lumorius.com |
| DevOps On-call | — | oncall@lumorius.com |
| Cloud Provider Support | AWS | Enterprise Support portal |
| Incident Response Firm | — | TBD |
| Cyber Insurance | — | TBD |

---

*INMARTECH PVT LTD · dr@lumorius.com · Confidential*
