# Observability Certification Report — Lumorius Enterprise Release Certification
**Date:** 2026-06-19 (UPDATED — Mission Critical Protocol)

## Stack
| Component | Tool | Status |
|-----------|------|--------|
| Metrics collection | Prometheus | ✅ CERTIFIED |
| Metrics visualization | Grafana | ✅ CERTIFIED |
| Log aggregation | Loki | ✅ CERTIFIED |
| Distributed tracing | Jaeger + OpenTelemetry | ✅ CERTIFIED |
| Alerting | AlertManager + PagerDuty + Slack | ✅ CERTIFIED |

## Metrics (Prometheus)
- Endpoint: `GET /api/metrics` (scrape target configured)
- Custom metrics: `lumorius_ai_requests_total`, `lumorius_document_uploads_total`, `lumorius_active_users_gauge`
- NestJS default metrics: HTTP request duration (histogram), event loop lag, heap usage
- Redis metrics: queue depth, processing rate
- PostgreSQL metrics: connection pool utilization, query duration

## Dashboards (Grafana — 5 dashboards)
1. **API Overview** — RPS, error rate, p50/p95/p99 latency
2. **Infrastructure** — CPU, memory, pod count, network I/O
3. **AI Usage** — requests/min, token consumption, cost/org
4. **SLO Burn Rate** — error budget, burn rate by window
5. **Security Events** — auth failures, rate limit hits, anomalies

## Logging (Loki)
- Format: structured JSON
- Fields: timestamp, level, service, traceId, userId, orgId, method, path, statusCode, durationMs
- Retention: 90 days
- Labels: `app`, `env`, `pod`, `namespace`
- Log levels: error, warn, info (production)

## Distributed Tracing (OpenTelemetry + Jaeger)
- All HTTP requests traced with `traceId` + `spanId`
- Database queries: traced with pg-otel
- Redis calls: traced
- AI API calls: traced (token count added to span attributes)
- Sampling: 100% in staging, 10% in production (head-based)

## Alerting (AlertManager)
| Alert | Condition | Severity | Channel |
|-------|-----------|---------|---------|
| HighErrorRate | error_rate > 1% for 5m | CRITICAL | PagerDuty |
| HighLatency | p99 > 1s for 10m | HIGH | PagerDuty |
| PodCrashLooping | restartCount > 3/15m | CRITICAL | PagerDuty |
| HighMemoryUsage | memory > 85% for 10m | HIGH | Slack |
| DatabaseConnPoolExhausted | pool_usage > 90% | CRITICAL | PagerDuty |
| RedisUnavailable | redis_up == 0 for 1m | CRITICAL | PagerDuty |
| AiBurstLimitBreached | ai_429_rate > 10% | HIGH | Slack |
| ErrorBudgetBurnRate | burn_rate > 14.4x for 1h | CRITICAL | PagerDuty |

## SLOs & SLIs
| SLO | Target | Measurement |
|-----|--------|------------|
| API availability | 99.9%/month | HTTPS success rate |
| API p99 latency | < 500ms | Non-AI endpoints |
| AI p99 latency | < 5s | AI endpoints |
| Error budget | 43.8min/month | 99.9% SLO |

## Certification
✅ **OBSERVABILITY CERTIFIED** — full MELT stack (Metrics, Events, Logs, Traces) operational
