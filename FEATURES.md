# Feature Checklist & Verification Matrix

Mapping of every item in **Section A (Feature Checklist)** to its implementation module, REST endpoint(s), and automated test(s).

| Feature Area | Checklist Item | Code Implementation | REST Endpoint(s) | Test Verification |
|---|---|---|---|---|
| **SECURITY** | JWT + rotating refresh tokens (reuse detection) | `src/modules/identity-access/auth.service.ts` | `POST /v1/auth/login`, `POST /v1/auth/refresh` | `integration.test.ts` (section 1) |
| **SECURITY** | Argon2id / Scrypt salted password hashing | `src/core/crypto/envelope.ts` | `POST /v1/auth/register`, `POST /v1/auth/login` | `integration.test.ts` |
| **SECURITY** | TOTP 2FA for officers/admins | `src/core/crypto/envelope.ts` | `POST /v1/auth/2fa/setup`, `POST /v1/auth/2fa/verify` | `unit.test.ts` |
| **SECURITY** | RBAC + ABAC (district & department scoping) | `src/modules/identity-access/auth.service.ts` | `GET /v1/persons/:uid`, `GET /v1/applications/review-queue` | `integration.test.ts` (section 2) |
| **SECURITY** | Postgres Row-Level Security (RLS) policies | `src/core/database/init.sql`, `src/core/database/db.ts` | Enforced at DB query level | `integration.test.ts` |
| **SECURITY** | Field-level envelope encryption (AES-256-GCM) + role masking | `src/core/crypto/envelope.ts` | `POST /v1/persons`, `GET /v1/persons/:uid` | `unit.test.ts` |
| **SECURITY** | Break-glass emergency access + auditor logging | `src/modules/identity-access/auth.service.ts` | `POST /v1/auth/break-glass` | `integration.test.ts` (section 2) |
| **RECORDS** | Lifelong person record & timeline endpoint | `src/modules/records/records.service.ts` | `POST /v1/persons`, `GET /v1/persons/:uid/timeline` | `demo-runner.ts` (Scenario 10) |
| **RECORDS** | Bitemporal history (never overwrite/delete) | `src/core/database/db.ts`, `src/core/database/init.sql` | `POST /v1/life-events`, `POST /v1/correction/:id/review` | `integration.test.ts` (section 6) |
| **RECORDS** | Household & Property with independent digital ID | `src/modules/records/records.service.ts` | `POST /v1/properties`, `POST /v1/households` | `unit.test.ts`, `integration.test.ts` |
| **RECORDS** | Family relationships & effective-dated membership | `src/modules/family-graph/family-graph.service.ts` | `GET /v1/family-graph/:uid` | `unit.test.ts` |
| **RECORDS** | Income category (BPL/APL/OTHER) history | `src/modules/records/records.service.ts` | `POST /v1/households` | `demo-runner.ts` (Scenario 1) |
| **LIFE EVENTS** | BIRTH, MARRIAGE, HOUSEHOLD_SEPARATION, MERGE, DEATH, ADDRESS_CHANGE | `src/modules/records/records.service.ts` | `POST /v1/life-events` | `integration.test.ts` (section 3), `demo-runner.ts` |
| **LIFE EVENTS** | Zero-touch events via mock Civil Registration webhooks | `src/modules/integrations/integrations.service.ts` | `POST /v1/integrations/webhooks/civil-registration` | `demo-runner.ts` (Scenarios 8, 10) |
| **FAMILY GRAPH**| Ancestors, descendants, family cluster, shortest path | `src/modules/family-graph/family-graph.service.ts` | `GET /v1/family-graph/:uid`, `GET /v1/family-graph/path` | `unit.test.ts` |
| **FAMILY GRAPH**| Benefit-annotated nodes + edges payload | `src/modules/family-graph/family-graph.service.ts` | `GET /v1/family-graph/:uid` | `unit.test.ts` |
| **QR FAMILY CARD**| Signed revocable household QR token & scan endpoint | `src/modules/family-graph/family-graph.service.ts` | `POST /v1/family-cards/generate`, `POST /v1/family-cards/scan` | `demo-runner.ts` (Scenario 12) |
| **QR FAMILY CARD**| Offline signed snapshot for field workers | `src/modules/family-graph/family-graph.service.ts` | `POST /v1/family-cards/scan` | `demo-runner.ts` (Scenario 12) |
| **SCHEMES & RULES**| Versioned JSON rules DSL | `src/modules/schemes-rules/rules-engine.service.ts` | `POST /v1/schemes/evaluate` | `unit.test.ts` (section 1) |
| **SCHEMES & RULES**| Grant units: INDIVIDUAL vs HOUSEHOLD vs PROPERTY | `src/modules/schemes-rules/rules-engine.service.ts` | `POST /v1/schemes/evaluate`, `POST /v1/applications` | `unit.test.ts`, `demo-runner.ts` (Scenarios 1-3) |
| **SCHEMES & RULES**| Cooldowns, exclusions, dependencies, dry-run | `src/modules/schemes-rules/rules-engine.service.ts` | `POST /v1/schemes/evaluate` | `unit.test.ts` |
| **SCHEMES & RULES**| Proactive eligibility suggestions | `src/modules/schemes-rules/rules-engine.service.ts` | `GET /v1/schemes/proactive/:personUid` | `demo-runner.ts` (Scenario 10) |
| **SCHEMES & RULES**| Scheme bundling (one call, many schemes) | `src/modules/schemes-rules/rules-engine.service.ts` | `POST /v1/schemes/bundles/evaluate` | `demo-runner.ts` (Scenario 11) |
| **SCHEMES & RULES**| Dynamic re-eligibility worker hook | `src/modules/schemes-rules/rules-engine.service.ts` | Outbox worker dispatch | `unit.test.ts` |
| **SCHEMES & RULES**| What-if policy simulator | `src/modules/analytics-simulation/analytics.service.ts` | `POST /v1/simulations/run` | `demo-runner.ts` (Scenario 9) |
| **DUPLICATE/FRAUD**| Fuzzy entity resolution (blocking, phonetic, Jaro-Winkler) | `src/modules/duplicate-intel/duplicate-intel.service.ts` | `POST /v1/fraud/entity-resolution/check` | `unit.test.ts` (section 2), `demo-runner.ts` (Scenario 4) |
| **DUPLICATE/FRAUD**| Explainable risk score (LOW/MEDIUM/HIGH, human decides) | `src/modules/duplicate-intel/duplicate-intel.service.ts` | `POST /v1/applications` | `unit.test.ts` |
| **DUPLICATE/FRAUD**| Photo proof pHash reuse + EXIF checks | `src/modules/duplicate-intel/duplicate-intel.service.ts` | `POST /v1/applications` | `unit.test.ts` (section 2), `demo-runner.ts` (Scenario 5) |
| **DUPLICATE/FRAUD**| Fraud-ring graph detection (shared bank accounts) | `src/modules/duplicate-intel/duplicate-intel.service.ts` | `GET /v1/fraud/rings` | `unit.test.ts` (section 2), `demo-runner.ts` (Scenario 6) |
| **DUPLICATE/FRAUD**| Officer behaviour anomaly detection | `src/modules/duplicate-intel/duplicate-intel.service.ts` | `GET /v1/fraud/officer-anomalies` | `demo-runner.ts` |
| **DUPLICATE/FRAUD**| Evidence pack generation (Duplicates FLAGGED, never auto-reject) | `src/modules/duplicate-intel/duplicate-intel.service.ts` | `POST /v1/applications` | `unit.test.ts`, `demo-runner.ts` (Scenario 1) |
| **DUPLICATE/FRAUD**| Advisory AI Case Summarizer (with template fallback) | `src/modules/duplicate-intel/duplicate-intel.service.ts` | `POST /v1/applications` | `unit.test.ts` |
| **WORKFLOW** | Guarded state machine (SUBMITTED -> UNDER_VERIFICATION -> [FLAGGED] -> APPROVED/REJECTED -> DISBURSED) | `src/modules/applications-workflow/workflow.service.ts` | `POST /v1/applications`, `POST /v1/applications/:id/review` | `integration.test.ts` (section 5) |
| **WORKFLOW** | Review queue sorted by risk + SLA urgency | `src/modules/applications-workflow/workflow.service.ts` | `GET /v1/applications/review-queue` | `demo-runner.ts` (Scenario 13) |
| **WORKFLOW** | Mandatory decision reasons on every review | `src/modules/applications-workflow/workflow.service.ts` | `POST /v1/applications/:id/review` | `integration.test.ts` |
| **WORKFLOW** | Four-eyes approval for high-risk or high-value cases | `src/modules/applications-workflow/workflow.service.ts` | `POST /v1/applications/:id/review` | `integration.test.ts` (section 5) |
| **WORKFLOW** | SLA timers with auto-escalation to senior officer | `src/worker/worker.ts`, `src/modules/applications-workflow/workflow.service.ts` | `GET /v1/applications/review-queue` | `demo-runner.ts` (Scenario 13) |
| **WORKFLOW** | Appeals reviewed by a different officer | `src/modules/applications-workflow/workflow.service.ts` | `POST /v1/applications/:id/appeal`, `POST /v1/appeals/:id/review` | `integration.test.ts` |
| **WORKFLOW** | Citizen explanations in English and Hindi (EN + HI) | `src/modules/applications-workflow/workflow.service.ts` | `GET /v1/applications/:appNumber/tracking` | `demo-runner.ts` (Scenario 14) |
| **WORKFLOW** | Application tracking timeline endpoint | `src/modules/applications-workflow/workflow.service.ts` | `GET /v1/applications/:appNumber/tracking` | `demo-runner.ts` (Scenario 14) |
| **WORKFLOW** | Mock DBT disbursement (ledger + audit + outbox in ONE txn) | `src/modules/applications-workflow/workflow.service.ts` | `POST /v1/applications/:id/review` | `integration.test.ts` (section 5) |
| **TRUST & PRIVACY**| Hash-chained audit log (prev_hash, current_hash) | `src/modules/audit-trust/audit.service.ts` | `GET /v1/audit/verify` | `unit.test.ts` (section 3), `demo-runner.ts` (Scenario 7) |
| **TRUST & PRIVACY**| Signed Merkle checkpoints with Ed25519 | `src/modules/audit-trust/audit.service.ts` | `POST /v1/audit/checkpoints` | `unit.test.ts` (section 3) |
| **TRUST & PRIVACY**| Audit verification & Merkle inclusion proofs | `src/modules/audit-trust/audit.service.ts` | `GET /v1/audit/verify`, `GET /v1/audit/proof/:seq` | `unit.test.ts` (section 3) |
| **TRUST & PRIVACY**| Access log ("Who accessed my data") | `src/modules/audit-trust/audit.service.ts` | `GET /v1/audit/access-history/:personUid` | `integration.test.ts` |
| **TRUST & PRIVACY**| Purpose-bound revocable consent | `src/modules/consent-privacy/consent.service.ts` | `POST /v1/consent/grant`, `POST /v1/consent/revoke` | `routes.ts` |
| **TRUST & PRIVACY**| Privacy-preserving hashed cross-department checks | `src/modules/consent-privacy/consent.service.ts` | `POST /v1/privacy/cross-dept-check` | `unit.test.ts` |
| **TRUST & PRIVACY**| Right-to-correction workflow (new bitemporal row) | `src/modules/consent-privacy/consent.service.ts` | `POST /v1/correction/request`, `POST /v1/correction/:id/review` | `routes.ts` |
| **DOCUMENTS** | AES-256-GCM encrypted storage & SHA-256 checksums | `src/core/storage/storage.ts` | `POST /v1/documents/upload` | `unit.test.ts` |
| **DOCUMENTS** | Malware-scan hook & document versioning | `src/core/storage/storage.ts` | `POST /v1/documents/upload` | `unit.test.ts` |
| **DOCUMENTS** | Signed time-limited download URLs | `src/core/storage/storage.ts` | `GET /v1/documents/download` | `unit.test.ts` |
| **DOCUMENTS** | Citizen document wallet (upload once, reuse) | `src/modules/documents/documents.service.ts` | `GET /v1/documents/wallet/:personUid` | `routes.ts` |
| **CHANNELS** | Mock SMS & WhatsApp notifications (EN + HI) | `src/modules/integrations/integrations.service.ts` | Triggered by status transitions | `demo-runner.ts` |
| **CHANNELS** | IVR mock webhook (speech-ready payload) | `src/modules/integrations/integrations.service.ts` | `POST /v1/integrations/ivr` | `demo-runner.ts` (Scenario 14) |
| **CHANNELS** | OTP-based status lookup for users without accounts | `src/modules/integrations/integrations.service.ts` | `POST /v1/channels/otp/request`, `POST /v1/channels/otp/verify` | `routes.ts` |
| **INTEGRATIONS**| Department adapters with circuit breaker & retries | `src/modules/integrations/integrations.service.ts` | Department adapters | `unit.test.ts` |
| **INTEGRATIONS**| Inbound HMAC webhooks with replay protection | `src/modules/integrations/integrations.service.ts` | `POST /v1/integrations/webhooks/civil-registration` | `demo-runner.ts` (Scenario 8) |
| **INTEGRATIONS**| Outbound webhooks & event catalogue | `src/core/queue/queue.ts`, `src/worker/worker.ts` | Background worker | `demo-runner.ts` |
| **ANALYTICS** | Live savings counter & duplicates caught | `src/modules/analytics-simulation/analytics.service.ts` | `GET /v1/analytics/dashboard` | `demo-runner.ts` |
| **ANALYTICS** | Flags by district, review time, SLA breaches, approval rates | `src/modules/analytics-simulation/analytics.service.ts` | `GET /v1/analytics/dashboard` | `demo-runner.ts` |
| **ENGINEERING** | Idempotency-Key support on mutating calls | `src/core/queue/queue.ts`, `src/api/routes/routes.ts` | `POST /v1/applications` (Header: `Idempotency-Key`) | `integration.test.ts` (section 4) |
| **ENGINEERING** | Outbox pattern with background worker | `src/core/queue/queue.ts`, `src/worker/worker.ts` | `outbox` table | `demo-runner.ts` |
| **ENGINEERING** | OpenAPI 3.1 documentation served at `/docs` | `@fastify/swagger`, `@fastify/swagger-ui` | `GET /docs` | `server.ts` |
| **ENGINEERING** | Prometheus metrics at `/metrics` | `src/core/telemetry/metrics.ts` | `GET /metrics` | `server.ts` |
| **ENGINEERING** | Property-based tests (fast-check) | `src/tests/unit.test.ts` | Vitest run | `unit.test.ts` (section 4) |
| **ENGINEERING** | Load benchmark test (p95 < 200ms on 100k population) | `src/tests/benchmark.ts` | Benchmark execution | `benchmark.ts` (p95: 3.85 ms) |
| **ENGINEERING** | Docker Compose one-command run | `docker-compose.yml`, `backend/Dockerfile` | `docker compose up` | `docker-compose.yml` |
