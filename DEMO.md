# Unified Digital Platform for Accessible Public Documentation
## Live Demo Guide (14 Hackathon Scenarios)

This document provides ready-to-run `curl` commands and step-by-step demonstrations for all 14 scripted scenarios required by the specification.

### 🖥️ Interactive Web Panels
You can test and demonstrate all workflows directly in your browser:
- **Gateway**: `http://localhost:3000/panel` (Single-click login for all roles)
- **Citizen Portal**: `http://localhost:3000/panel/citizen` (Live dry-run, scheme apply, QR card, wallet)
- **Admin / Officer Portal**: `http://localhost:3000/panel/admin` (Review queue, four-eyes approval, fraud rings, what-if simulator, audit tamper simulation)

To run the automated CLI verification of all 14 scenarios in one command:
```bash
cd backend
npm run demo
```

---

### Demo Credentials for All Roles
All seeded accounts use password: `Demo@Password123`

| Role | Username | Email | District | Purpose |
|---|---|---|---|---|
| **CITIZEN** | `citizen_demo` | citizen@gov.demo | CENTRAL | Self-service citizen, application tracking, document wallet |
| **CLERK** | `clerk_demo` | clerk@gov.demo | CENTRAL | Intake screening, document verification |
| **OFFICER** | `officer_sharma` | officer1@gov.demo | CENTRAL | Primary review & approval |
| **OFFICER** | `officer_verma` | officer2@gov.demo | CENTRAL | Secondary approval (four-eyes review) |
| **SENIOR_OFFICER**| `senior_officer_patel`| senior@gov.demo | CENTRAL | High-risk overrides, SLA escalation queue |
| **FIELD_WORKER** | `field_worker_ram` | field@gov.demo | CENTRAL | Offline QR scanning, door-to-door verification |
| **DEPT_ADMIN** | `dept_admin_singh` | admin@gov.demo | CENTRAL | Scheme configuration, rule editing |
| **AUDITOR** | `auditor_gupta` | auditor@gov.demo | CENTRAL | Hash-chain verification, anomaly inspection |
| **SYSTEM_ADMIN** | `sysadmin_rao` | sysadmin@gov.demo | CENTRAL | Platform operations, break-glass review |

To obtain a token for any user:
```bash
curl -X POST http://localhost:3000/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"officer_sharma","password":"Demo@Password123"}'
```

---

### Scenario 1: The Brothers (Property-Level Grant Interception)
**Context:** Brother A (BPL) and Brother B (APL) share Property `PROP-CEN-001`. Brother A already claimed and received the Swachh Bharat Toilet Grant (`SBM_TOILET`). Brother B applies -> FLAGGED with evidence pack. Brother A's child applies -> FLAGGED.

```bash
# 1. Brother B applies for Toilet Grant on the shared property
curl -X POST http://localhost:3000/v1/applications \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <CITIZEN_TOKEN>" \
  -d '{
    "applicantPersonUid": "<BROTHER_B_UID>",
    "schemeCode": "SBM_TOILET",
    "propertyUid": "<PROPERTY_UID>"
  }'
```
**Expected Response:** `status: "FLAGGED"`, `riskScore: "HIGH"`, evidence pack showing prior disbursement transaction reference on that Property UID. NEVER auto-rejected.

---

### Scenario 2: Individual Scheme (Unaffected Relative)
**Context:** Brother B's child applies for a Merit Scholarship (`SCHOLARSHIP_MERIT`, grant unit: `INDIVIDUAL`). Because it is an INDIVIDUAL grant, the relative's income or property grant history is ignored.

```bash
curl -X POST http://localhost:3000/v1/applications \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <CITIZEN_TOKEN>" \
  -d '{
    "applicantPersonUid": "<CHILD_B_UID>",
    "schemeCode": "SCHOLARSHIP_MERIT"
  }'
```
**Expected Response:** `status: "UNDER_VERIFICATION"`, `eligible: true`.

---

### Scenario 3: Household Split (Property Benefit Stays with Property)
**Context:** Brother B separates into a new household and moves to a new property. Bitemporal memberships update; toilet grant history remains attached to original property.

```bash
curl -X POST http://localhost:3000/v1/life-events \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <OFFICER_TOKEN>" \
  -d '{
    "event_type": "HOUSEHOLD_SEPARATION",
    "person_uid": "<BROTHER_B_UID>",
    "payload": {
      "old_household_uid": "<HH_UID>",
      "new_property_uid": "<NEW_PROPERTY_UID>",
      "separating_member_uids": ["<BROTHER_B_UID>", "<CHILD_B_UID>"],
      "new_head_uid": "<BROTHER_B_UID>",
      "income_category": "BPL",
      "district": "CENTRAL"
    }
  }'
```

---

### Scenario 4: Fuzzy Match (Typos and Indian Name Variations)
**Context:** An applicant submits with name `Rajeysh Sharrma` and address `Hs 42 Rampur`. Blocking + Jaro-Winkler + phonetic transliteration catches the match.

```bash
curl -X POST http://localhost:3000/v1/fraud/entity-resolution/check \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <OFFICER_TOKEN>" \
  -d '{
    "applicantPersonUid": "<PER_FUZZY_UID>",
    "schemeId": "SBM_TOILET"
  }'
```
**Expected Response:** `isFlaggedDuplicate: true`, `factor: "FUZZY_NAME_ADDRESS_MATCH"`, composite score >= 40.

---

### Scenario 5: Photo Reuse Detection (Perceptual Hash)
**Context:** Applicant reuses the same proof photo as Brother A.

```bash
curl -X POST http://localhost:3000/v1/applications \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <CITIZEN_TOKEN>" \
  -d '{
    "applicantPersonUid": "<BROTHER_B_UID>",
    "schemeCode": "SBM_TOILET",
    "proofPhotoPhash": "a1b2c3d4e5f60718"
  }'
```
**Expected Response:** `isFlaggedDuplicate: true`, `factors` includes `PHOTO_HASH_REUSE_DETECTED`.

---

### Scenario 6: Fraud Ring Graph Detection (Shared Bank Account)
**Context:** 6 unrelated households share one bank account hash. Graph analytics detects high centrality syndicate.

```bash
curl -X GET http://localhost:3000/v1/fraud/rings \
  -H "Authorization: Bearer <OFFICER_TOKEN>"
```
**Expected Response:** List of detected fraud rings with cluster UID, entity count >= 6, and `confidence: "VERY_HIGH"`.

---

### Scenario 7: Tamper Test (Hash-Chained Audit Log Verification)
**Context:** Verify untampered log, modify a row, verify that `/v1/audit/verify` detects the exact broken sequence.

```bash
# Verify integrity
curl -X GET http://localhost:3000/v1/audit/verify
```
**Expected Response:** `{"valid": true, "totalEntries": 142}` (or broken sequence if modified).

---

### Scenario 8: Death Event Zero-Touch (CRS Webhook Stops Pension)
**Context:** Civil Registration webhook reports death; person record marked DECEASED bitemporally, stops benefits, and alerts officer.

```bash
curl -X POST http://localhost:3000/v1/integrations/webhooks/civil-registration \
  -H "Content-Type: application/json" \
  -d '{
    "eventId": "EVT-DEATH-001",
    "eventType": "CIVIL_REG.DEATH",
    "timestamp": "1729740000",
    "data": {
      "person_uid": "<PENSIONER_UID>",
      "death_date": "2026-10-24T00:00:00Z",
      "cause": "Natural",
      "certificate_no": "DC-2026-98765"
    }
  }'
```

---

### Scenario 9: What-if Policy Simulator
**Context:** Replay proposed rule changes over the synthetic population.

```bash
curl -X POST http://localhost:3000/v1/simulations/run \
  -H "Content-Type: application/json" \
  -d '{
    "simulationName": "Expand Pension Age to 55",
    "schemeCode": "OLD_AGE_PENSION",
    "proposedChanges": {
      "minAge": 55,
      "newBenefitAmount": 3500
    }
  }'
```
**Expected Response:** Newly eligible count, newly ineligible count, estimated cost delta in INR, and district breakdown.

---

### Scenario 10: Zero-Touch Birth Event & Proactive Suggestion
**Context:** Civil registration birth event registers infant and suggests proactive schemes.

```bash
curl -X POST http://localhost:3000/v1/integrations/webhooks/civil-registration \
  -H "Content-Type: application/json" \
  -d '{
    "eventId": "EVT-BIRTH-001",
    "eventType": "CIVIL_REG.BIRTH",
    "timestamp": "1729740000",
    "data": {
      "first_name": "Navya",
      "last_name": "Sharma",
      "date_of_birth": "2026-10-24",
      "gender": "FEMALE",
      "address_line": "House No 42 Rampur",
      "district": "CENTRAL"
    }
  }'
```

---

### Scenario 11: Scheme Bundling
**Context:** Evaluate multiple schemes in one bundle (`BUNDLE_VULNERABLE_SUPPORT`).

```bash
curl -X POST http://localhost:3000/v1/schemes/bundles/evaluate \
  -H "Content-Type: application/json" \
  -d '{
    "bundleCode": "BUNDLE_VULNERABLE_SUPPORT",
    "applicantPersonUid": "<PERSON_UID>"
  }'
```

---

### Scenario 12: QR Family Benefit Card Scan
**Context:** Scan signed household QR token; returns received & pending benefits.

```bash
# 1. Generate Family Card
curl -X POST http://localhost:3000/v1/family-cards/generate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <OFFICER_TOKEN>" \
  -d '{"householdUid": "<HOUSEHOLD_UID>"}'

# 2. Scan Signed Token
curl -X POST http://localhost:3000/v1/family-cards/scan \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <FIELD_WORKER_TOKEN>" \
  -d '{"signedJwt": "<SIGNED_JWT>"}'
```

---

### Scenario 13: SLA Auto-Escalation
**Context:** Untouched applications exceeding the SLA deadline are automatically escalated to Senior Officer queue.

```bash
curl -X GET http://localhost:3000/v1/applications/review-queue \
  -H "Authorization: Bearer <SENIOR_OFFICER_TOKEN>"
```

---

### Scenario 14: IVR Mock Call Status
**Context:** Citizen calls IVR with keypad application reference number; receives audio/text status in English & Hindi.

```bash
curl -X POST http://localhost:3000/v1/integrations/ivr \
  -H "Content-Type: application/json" \
  -d '{
    "callerPhone": "9811003344",
    "digitsEntered": "1234",
    "callType": "INBOUND_CALL"
  }'
```
