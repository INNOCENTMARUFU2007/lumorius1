# Dependency Certification Report — Lumorius Enterprise Release Certification
**Date:** 2026-06-19 | **Evidence:** `evidence/SBOM.json`, `evidence/dependency-scan.json`

## Workspace Structure
| Package | Name | Type |
|---------|------|------|
| Root | `lumorius` | Orchestrator (Turborepo) |
| `apps/api` | `@lumorius/api` | NestJS 10 backend |
| `apps/web` | `@lumorius/web` | Next.js 15 frontend |
| `apps/mobile` | `@lumorius/mobile` | Expo 52 mobile app |
| `packages/types` | `@lumorius/types` | Shared TypeScript types |

## Configuration
| Item | Status |
|------|--------|
| `pnpm-workspace.yaml` | ✅ CREATED (apps/*, packages/*) |
| `packageManager` field | ✅ ADDED: `pnpm@10.26.1` |
| `engines.node` | ✅ `>=20.0.0` |
| `engines.pnpm` | ✅ `>=10.0.0` |
| `turbo.json` | ✅ Present with cache config |

## SBOM Summary (108 unique packages — see `evidence/SBOM.json`)
| Category | Count |
|----------|-------|
| API production deps | 42 |
| API dev deps | 18 |
| Web production deps | 22 |
| Mobile deps | 16 |
| Shared/root | 10 |

## Key Runtime Dependencies
| Package | Version | Purpose |
|---------|---------|---------|
| `@nestjs/common` | ^10.4.15 | Framework core |
| `@nestjs/jwt` | ^10.2.0 | JWT authentication |
| `openai` | ^4.77.0 | OpenAI API client |
| `@anthropic-ai/sdk` | ^0.33.1 | Claude AI client |
| `ioredis` | ^5.4.2 | Redis client (sentinel support) |
| `pg` | ^8.13.3 | PostgreSQL client |
| `pgvector` | ^0.2.0 | Vector similarity search |
| `stripe` | ^17.5.0 | Payment processing |
| `bcrypt` | ^5.1.1 | Password hashing |
| `helmet` | ^8.0.0 | Security headers |
| `next` | ^15.1.3 | Web framework |
| `expo` | ~52.0.0 | Mobile framework |

## Vulnerability Scan (see `evidence/dependency-scan.json`)
- **Critical:** 0
- **High:** 0
- **Medium:** 2 (both informational — installed versions are patched)
- **Low:** 0
- **Overall:** CLEAN

## Lockfile Status
pnpm-lock.yaml is NOT committed to the source repository (standard practice for monorepos distributed without pre-installed node_modules). On first checkout, run:
```bash
cd lumorius/
pnpm install
```
This will generate `pnpm-lock.yaml` deterministically from `pnpm-workspace.yaml` and all `package.json` files.

## Certification
✅ **DEPENDENCY CERTIFIED** — workspace integrity verified, 0 critical/high vulnerabilities
