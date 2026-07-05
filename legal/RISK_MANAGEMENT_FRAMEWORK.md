# Risk Management Framework — INMARTECH PVT LTD

**Version:** 1.0 · **Date:** June 19, 2026

## 1. Risk Appetite
Low tolerance for: regulatory non-compliance, data breaches, extended downtime.
Moderate tolerance for: product failures, market risks.

## 2. Risk Register Categories
1. Technology Risk (system outages, data loss, cyberattacks)
2. Compliance Risk (GDPR, CCPA, SOC 2 violations)
3. Operational Risk (key-person dependency, process failures)
4. Financial Risk (runway, payment failures)
5. Legal Risk (IP disputes, contractual breaches)
6. Reputational Risk (security incidents, negative press)

## 3. Risk Assessment
Each risk is scored: Impact (1-5) × Likelihood (1-5) = Risk Score (1-25).
- 20-25: Critical — immediate action required
- 12-19: High — action within 30 days
- 6-11: Medium — action within 90 days
- 1-5: Low — monitor

## 4. Mitigation Controls
| Risk | Control |
|------|---------|
| Data breach | Encryption, WAF, penetration testing |
| API downtime | Multi-AZ, circuit breakers, auto-scaling |
| GDPR violation | DSAR automation, retention jobs, DPO |
| Key-person loss | Documentation, cross-training, succession plan |

## 5. Review Cycle
Risk register reviewed monthly. Board notified of Critical/High risks within 24h.
