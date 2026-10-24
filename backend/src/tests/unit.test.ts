import { describe, it, expect, beforeEach } from 'vitest';
import fc from 'fast-check';
import { db } from '../core/database/db';
import { rulesEngineService } from '../modules/schemes-rules/rules-engine.service';
import { duplicateFraudIntelService } from '../modules/duplicate-intel/duplicate-intel.service';
import { auditTrustService } from '../modules/audit-trust/audit.service';
import { cryptoService } from '../core/crypto/envelope';
import { runSeed } from '../seeds/seed';

describe('Unit Tests: Core Domain Logic', () => {
  let seeds: any;

  beforeEach(async () => {
    seeds = await runSeed(500); // 500 for fast unit test runs
  });

  describe('1. Rules Engine & Grant Unit Logic', () => {
    it('should correctly evaluate INDIVIDUAL grant unit (Scholarship)', () => {
      const result = rulesEngineService.evaluateEligibility({
        schemeCode: 'SCHOLARSHIP_MERIT',
        applicantPersonUid: seeds.childB.person_uid,
      });

      expect(result.eligible).toBe(true);
      expect(result.grantUnit).toBe('INDIVIDUAL');
      expect(result.passedRules.length).toBeGreaterThan(0);
      expect(result.failedRules.length).toBe(0);
    });

    it('should block PROPERTY grant unit if already disbursed to property (Scenario 1)', () => {
      // Brother B applies for Toilet Grant on the SAME property where Brother A got it
      const result = rulesEngineService.evaluateEligibility({
        schemeCode: 'SBM_TOILET',
        applicantPersonUid: seeds.brotherB.person_uid,
        propertyUid: seeds.prop1.property_uid,
      });

      expect(result.eligible).toBe(false);
      expect(result.grantUnit).toBe('PROPERTY');
      expect(result.failedRules.some((r) => r.includes('PROPERTY: toilet/infrastructure grant already disbursed'))).toBe(true);
    });

    it('should block Child A applying for Toilet Grant on same property', () => {
      const result = rulesEngineService.evaluateEligibility({
        schemeCode: 'SBM_TOILET',
        applicantPersonUid: seeds.childA.person_uid,
        propertyUid: seeds.prop1.property_uid,
      });

      expect(result.eligible).toBe(false);
      expect(result.grantUnit).toBe('PROPERTY');
    });
  });

  describe('2. Entity Resolution & Duplicate Intelligence', () => {
    it('should normalize Indian names handling phonetics and affixes', () => {
      const norm1 = duplicateFraudIntelService.normalizeIndianName('Suresh Kumar Sharma');
      const norm2 = duplicateFraudIntelService.normalizeIndianName('Suresh Verma');
      expect(norm1).toBe('sures');
      expect(norm2).toBe('sures');
    });

    it('should detect high Jaro-Winkler similarity on typos and transliterations', () => {
      const sim = duplicateFraudIntelService.jaroWinklerSimilarity('rajesh', 'rajsh');
      expect(sim).toBeGreaterThan(0.9);
    });

    it('should detect photo perceptual hash collision (Scenario 5)', () => {
      const risk = duplicateFraudIntelService.evaluateApplicationRisk({
        applicantPersonUid: seeds.brotherB.person_uid,
        schemeId: 'SBM_TOILET',
        proofPhotoPhash: 'a1b2c3d4e5f60718', // Matches Brother A's photo
      });

      expect(risk.riskScore).toBe('HIGH');
      expect(risk.isFlaggedDuplicate).toBe(true);
      expect(risk.factors.some((f) => f.factor === 'PHOTO_HASH_REUSE_DETECTED')).toBe(true);
    });

    it('should detect shared bank account fraud ring (Scenario 6)', () => {
      const rings = duplicateFraudIntelService.detectFraudRings();
      expect(rings.length).toBeGreaterThanOrEqual(1);
      const ring = rings.find((r) => r.entityCount >= 6);
      expect(ring).toBeDefined();
      expect(ring?.confidence).toBe('VERY_HIGH');
    });
  });

  describe('3. Tamper-evident Hash Chain & Merkle Proofs (Scenario 7)', () => {
    it('should verify an untampered audit log chain', () => {
      const verify = auditTrustService.verifyAuditChain();
      expect(verify.valid).toBe(true);
      expect(verify.totalEntries).toBeGreaterThan(0);
    });

    it('should immediately detect any modified or forged audit row', () => {
      const table = db.getTable('audit_log');
      expect(table.length).toBeGreaterThan(2);

      // Tamper with record #2
      const originalPayload = table[1].action;
      table[1].action = 'UNAUTHORIZED_FORGED_ACTION';

      const verify = auditTrustService.verifyAuditChain();
      expect(verify.valid).toBe(false);
      expect(verify.brokenSequence).toBe(2);
      expect(verify.reason).toContain('tamper detected');

      // Revert tamper
      table[1].action = originalPayload;
    });

    it('should generate valid Merkle inclusion proofs', () => {
      const proofObj = auditTrustService.getInclusionProof(1);
      expect(proofObj).not.toBeNull();
      expect(proofObj?.sequence).toBe(1);
      expect(proofObj?.proof.length).toBeGreaterThan(0);
    });
  });

  describe('4. Property-Based Test: No double benefit per grant unit (fast-check)', () => {
    it('proves that a PROPERTY-level benefit can never be evaluated as eligible twice on the same property UID', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 5, maxLength: 10 }),
          fc.integer({ min: 18, max: 80 }),
          (propSuffix, age) => {
            const testPropertyUid = `PROP-TEST-${propSuffix}`;
            const testPersonUid = `PER-TEST-${propSuffix}`;

            // Add dummy ledger disbursement
            const ledger = db.getTable('benefit_ledger');
            const scheme = db.getTable('schemes').find((s) => s.code === 'SBM_TOILET');

            ledger.push({
              id: crypto.randomUUID(),
              scheme_id: scheme?.id,
              person_uid: 'OTHER_PERSON',
              property_uid: testPropertyUid,
              grant_unit: 'PROPERTY',
              amount: 12000,
              disbursed_at: new Date().toISOString(),
              transaction_ref: `TXN-${propSuffix}`,
              status: 'SUCCESS',
            });

            // Person in memory
            const persons = db.getTable('persons');
            persons.push({
              id: crypto.randomUUID(),
              person_uid: testPersonUid,
              first_name: 'Test',
              last_name: 'User',
              full_name: 'Test User',
              date_of_birth: `${new Date().getFullYear() - age}-01-01`,
              gender: 'MALE',
              address_line: 'Test Address',
              district: 'CENTRAL',
              state: 'Delhi',
              pincode: '110001',
              status: 'ALIVE',
              valid_from: new Date().toISOString(),
              valid_to: '9999-12-31T23:59:59.000Z',
              recorded_from: new Date().toISOString(),
              recorded_to: '9999-12-31T23:59:59.000Z',
              is_current: true,
            });

            const evalResult = rulesEngineService.evaluateEligibility({
              schemeCode: 'SBM_TOILET',
              applicantPersonUid: testPersonUid,
              propertyUid: testPropertyUid,
            });

            // Must NOT be eligible because property has prior grant
            expect(evalResult.eligible).toBe(false);
          }
        ),
        { numRuns: 25 }
      );
    });
  });
});
