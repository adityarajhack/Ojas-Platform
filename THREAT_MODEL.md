# STRIDE Threat Model

Security and Threat Analysis for the **Unified Digital Platform for Accessible Public Documentation**.

## System Overview
The backend provides APIs for lifelong citizen documentation, welfare eligibility assessment, fraud intelligence, and DBT disbursement. It handles highly sensitive Personally Identifiable Information (PII), biometric/perceptual hashes, and public funds transfer instructions.

---

## STRIDE Threat Matrix

| Threat Category | Potential Threat | Platform Countermeasure & Defense | Verification / Test |
|---|---|---|---|
| **S - Spoofing** | • Adversary presents stolen JWT or replayed refresh token.<br>• Fake civil-registration webhooks injected to register ghost beneficiaries.<br>• Phished officer credentials used to approve grants. | • Rotating refresh tokens with automated **Token Family Invalidation** on reuse detection.<br>• Mandatory TOTP 2FA for privileged OFFICER, SENIOR_OFFICER, and ADMIN roles.<br>• Inbound webhooks secured with HMAC-SHA256 signatures, shared secrets, and strict 5-minute timestamp replay tolerance windows. | `integration.test.ts` (section 1), `demo-runner.ts` (Scenario 8) |
| **T - Tampering** | • Malicious insider or rogue DB admin alters audit logs to conceal fraudulent approvals.<br>• Bitemporal records altered or deleted directly in DB.<br>• Verification document payloads modified after upload. | • **Hash-Chained Audit Log** (each record includes `prev_hash` and SHA-256 payload hash).<br>• Periodic epoch **Merkle Checkpoints signed with Ed25519** digital signatures.<br>• Database triggers permanently block `DELETE` statements on bitemporal and ledger tables.<br>• Document files stored with SHA-256 integrity checksums and AES-256-GCM authenticated encryption. | `unit.test.ts` (section 3), `integration.test.ts` (section 6) |
| **R - Repudiation** | • Official denies having approved a high-risk fraudulent grant.<br>• Citizen disputes receiving DBT benefit disbursement. | • Four-eyes approval records immutable officer user IDs, mandatory justification reasons, and timestamps.<br>• Benefit ledger disbursements record unique transaction references, ledger events, and outbox logs in a single atomic transaction.<br>• Immutable `evaluation_snapshot` stored with every application capturing the exact version of the rules DSL used at decision time. | `integration.test.ts` (section 5) |
| **I - Information Disclosure** | • Clerks or officers snooping on citizens from other jurisdictions.<br>• Plaintext Aadhaar, bank numbers, or income exposed in API responses or logs.<br>• Departments querying other ministries leaking citizen identity lists. | • **Attribute-Based Access Control (ABAC)** district scoping: officers cannot view profiles outside their assigned district.<br>• Field-level envelope encryption (AES-256-GCM) with KMS interface and role-based masking (e.g. `XXXX-XXXX-1234`).<br>• Privacy-preserving cross-department matching queries using blind HMAC hashes (`id_hash_hmac`), returning only `{ match: boolean, reference_id }`. | `integration.test.ts` (section 2), `unit.test.ts` (section 2) |
| **D - Denial of Service** | • Attackers flood application submission endpoints or queue workers.<br>• Large uploaded files exhaust server memory.<br>• Slow regex/fuzzy matching causes CPU lockups. | • Global rate limiting (200 requests/minute per IP) via `@fastify/rate-limit`.<br>• Strict 10MB payload size limit on Fastify instance.<br>• Fuzzy matching utilizes blocking filters (trigram / phonetic) before pairwise scoring to eliminate $O(N^2)$ bottlenecks. | `benchmark.ts` (p95 latency 3.85 ms across 100k records) |
| **E - Elevation of Privilege** | • Field worker attempting supervisory approval.<br>• Officer approving both review steps to bypass four-eyes protocol.<br>• Officer fabricating break-glass emergencies. | • Role-Based Access Control (RBAC) guard middleware.<br>• Four-eyes state machine explicitly validates `reviewer_2 !== reviewer_1`.<br>• Break-glass access enforces mandatory written justification (min 10 chars), is strictly time-limited, logs into `access_log`, and generates immediate auditor alerts. | `integration.test.ts` (sections 2 & 5) |

---

## Defensive Cryptographic Profile
- **Password Storage**: Scrypt with per-user cryptographic salt (Argon2id profile).
- **Envelope Encryption**: AES-256-GCM with authenticated 128-bit authentication tags.
- **HMAC Fingerprinting**: HMAC-SHA256 with rotating server secret for blind cross-agency index lookups.
- **Audit Verification**: SHA-256 hash chaining + Ed25519 public-key signature on periodic Merkle trees.
- **QR Family Card**: Signed JSON Web Token with ECDSA/HMAC signature for offline verification by field workers.
