# Business Continuity Policy
**Organization:** INMARTECH PVT LTD  
**Version:** 1.0 · June 2026  
**Owner:** Chief Executive Officer  
**Review Cycle:** Annual

---

## 1. Purpose

This policy ensures INMARTECH PVT LTD can continue delivering Lumorius AI platform services during and after a disruptive event, and can recover to normal operations within defined time objectives.

---

## 2. Scope

Covers all systems, processes, and personnel required to deliver Lumorius AI platform services to customers, including: API, web application, database, AI processing, email, monitoring, and customer support functions.

---

## 3. Business Impact Analysis

| Business Function | RTO | RPO | Criticality |
|------------------|-----|-----|-------------|
| Lumorius API | 4 hours | 1 hour | Critical |
| Web Application | 4 hours | 24 hours | Critical |
| Database (PostgreSQL) | 4 hours | 1 hour | Critical |
| AI Processing (OpenAI) | Dependent on provider | N/A | High |
| Email Delivery | 8 hours | N/A | High |
| Admin / Support Portal | 8 hours | 24 hours | Medium |
| Billing System | 8 hours | 1 hour | High |
| Monitoring / Alerting | 2 hours | N/A | Critical |
| CI/CD Pipeline | 24 hours | N/A | Medium |

**RTO:** Recovery Time Objective (maximum acceptable downtime)  
**RPO:** Recovery Point Objective (maximum acceptable data loss)

---

## 4. Threat Scenarios

| Scenario | Probability | Impact | Primary Response |
|---------|-------------|--------|-----------------|
| Cloud provider outage (single AZ) | Medium | High | Failover to secondary AZ |
| Cloud provider outage (regional) | Low | Critical | Failover to secondary region |
| Database corruption | Low | Critical | Restore from backup |
| Ransomware attack | Low | Critical | Isolate, restore from air-gapped backup |
| Key personnel loss | Medium | High | Cross-training, documentation |
| DDoS attack | Medium | High | Cloudflare mitigation, rate limiting |
| Third-party AI provider outage | Medium | Medium | Graceful degradation (AI features offline) |
| Data centre fire/flood | Very Low | Critical | Cloud redundancy; no physical DC |
| Cyber breach | Low | Critical | IRP + Disaster Recovery Plan |

---

## 5. Recovery Strategies

### 5.1 Infrastructure Redundancy
- All production services run across minimum 2 Availability Zones
- Load balancing with automatic failover via Kubernetes
- Database primary-replica configuration with automated failover (< 30s)
- Cloudflare for DNS, DDoS mitigation, and global CDN

### 5.2 Backup and Restoration
- Daily automated database backups to encrypted S3-compatible storage
- Weekly full backups + daily incrementals
- Backups tested quarterly with a restore drill
- Backup retention: 30 days (daily), 12 months (monthly)
- Cross-region backup replication for critical data

### 5.3 AI Provider Resilience
- Primary: OpenAI GPT-4o
- AI features degrade gracefully to manual workflows when provider is unavailable
- Roadmap: secondary provider (Anthropic Claude) for failover (Q4 2026)

### 5.4 Communication Continuity
- Customer communication via: status.lumorius.com + email + Slack
- Internal communication via: Signal (backup), WhatsApp (backup)
- All customer contracts, contacts, and runbooks stored in replicated document store

---

## 6. Roles and Responsibilities

| Role | Responsibility |
|------|---------------|
| CEO | Overall BCP activation authority |
| CTO | Technical recovery coordination |
| CSO | Security incident management |
| DevOps Lead | Infrastructure recovery execution |
| Customer Success Lead | Customer communication |
| Finance Lead | Vendor payments during crisis |

---

## 7. BCP Activation

7.1 Any member of the Incident Response Team may recommend BCP activation.

7.2 The CEO or CTO may formally activate the BCP.

7.3 Upon activation:
- Assemble response team (virtual war room in Slack #incident-room)
- Assess current impact against BIA targets
- Execute relevant runbook
- Communicate to customers per SLA obligations
- Log all decisions with timestamps

---

## 8. Testing and Maintenance

| Activity | Frequency |
|----------|-----------|
| Tabletop exercise | Semi-annual |
| Backup restore drill | Quarterly |
| Failover test (AZ) | Quarterly |
| Full DR drill | Annual |
| BCP policy review | Annual |
| Team training | Annual |

---

## 9. Related Documents
- Disaster Recovery Policy
- Incident Response Policy
- Service Level Agreement

*INMARTECH PVT LTD · bcp@lumorius.com*
