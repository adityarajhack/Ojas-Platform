import { describe, it, expect, beforeAll } from 'vitest';
import { buildServer } from '../api/server';
import { db } from '../core/database/db';
import { runSeed } from '../seeds/seed';
import { FastifyInstance } from 'fastify';

describe('Integration Tests: End-to-End API Workflows', () => {
  let server: FastifyInstance;
  let seeds: any;
  let citizenToken: string;
  let officer1Token: string;
  let officer2Token: string;

  beforeAll(async () => {
    seeds = await runSeed(300);
    server = await buildServer();

    // Login Citizen
    const citizenLogin = await server.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { username: 'citizen_demo', password: 'Demo@Password123' },
    });
    citizenToken = citizenLogin.json().accessToken;

    // Login Officer 1
    const off1Login = await server.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { username: 'officer_sharma', password: 'Demo@Password123' },
    });
    officer1Token = off1Login.json().accessToken;

    // Login Officer 2
    const off2Login = await server.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { username: 'officer_verma', password: 'Demo@Password123' },
    });
    officer2Token = off2Login.json().accessToken;
  });

  describe('1. Authentication, Refresh Token Rotation & Reuse Detection', () => {
    it('rotates refresh tokens and blocks reuse', async () => {
      const loginRes = await server.inject({
        method: 'POST',
        url: '/v1/auth/login',
        payload: { username: 'citizen_demo', password: 'Demo@Password123' },
      });
      const initialRefresh = loginRes.json().refreshToken;

      // 1st rotation: valid
      const refreshRes1 = await server.inject({
        method: 'POST',
        url: '/v1/auth/refresh',
        payload: { refreshToken: initialRefresh },
      });
      expect(refreshRes1.statusCode).toBe(200);
      const newRefresh = refreshRes1.json().refreshToken;
      expect(newRefresh).not.toBe(initialRefresh);

      // Replay attack: try using initialRefresh again -> must trigger reuse detection (403)
      const replayRes = await server.inject({
        method: 'POST',
        url: '/v1/auth/refresh',
        payload: { refreshToken: initialRefresh },
      });
      expect(replayRes.statusCode).toBe(403);
      expect(replayRes.json().detail).toContain('reuse detected');
    });
  });

  describe('2. RBAC, ABAC & Break-Glass Access', () => {
    it('enforces district scoping and allows emergency break-glass', async () => {
      // Create person in EAST district
      const eastPerson = db.insert('persons', {
        person_uid: 'PER-EAST-999',
        first_name: 'East',
        last_name: 'Citizen',
        full_name: 'East Citizen',
        district: 'EAST',
        address_line: 'East Zone Road',
        state: 'Delhi',
        pincode: '110091',
        date_of_birth: '1990-01-01',
        gender: 'MALE',
        status: 'ALIVE',
        is_current: true,
      });

      // officer_sharma has district = CENTRAL; attempting to read EAST person record should fail with 403
      const forbiddenRead = await server.inject({
        method: 'GET',
        url: `/v1/persons/${eastPerson.person_uid}`,
        headers: { authorization: `Bearer ${officer1Token}` },
      });
      expect(forbiddenRead.statusCode).toBe(403);

      // Break-glass request with required mandatory reason
      const breakGlassRes = await server.inject({
        method: 'POST',
        url: '/v1/auth/break-glass',
        headers: { authorization: `Bearer ${officer1Token}` },
        payload: {
          personUid: eastPerson.person_uid,
          reason: 'Disaster response: Verifying flood victim family in relief camp.',
        },
      });
      expect(breakGlassRes.statusCode).toBe(200);
      expect(breakGlassRes.json().success).toBe(true);
    });
  });

  describe('3. Life Events: Household Separation & Property Benefits (Scenario 3)', () => {
    it('preserves property benefit history on household split', async () => {
      // Split Brother B out into new household with new property
      const newProp = db.insert('properties', {
        property_uid: 'PROP-NEW-SPLIT-888',
        property_type: 'RESIDENTIAL',
        normalized_address: 'House 99, North Colony',
        district: 'NORTH',
        pincode: '110099',
        is_current: true,
      });

      const splitRes = await server.inject({
        method: 'POST',
        url: '/v1/life-events',
        headers: { authorization: `Bearer ${officer1Token}` },
        payload: {
          event_type: 'HOUSEHOLD_SEPARATION',
          person_uid: seeds.brotherB.person_uid,
          payload: {
            old_household_uid: seeds.hh1.household_uid,
            new_property_uid: newProp.property_uid,
            separating_member_uids: [seeds.brotherB.person_uid, seeds.childB.person_uid],
            new_head_uid: seeds.brotherB.person_uid,
            income_category: 'BPL',
            district: 'NORTH',
          },
        },
      });
      expect(splitRes.statusCode).toBe(201);

      // Verify that on OLD property, toilet grant is STILL recorded and cannot be re-claimed
      const reapplyOld = await server.inject({
        method: 'POST',
        url: '/v1/schemes/evaluate',
        payload: {
          schemeCode: 'SBM_TOILET',
          applicantPersonUid: seeds.childA.person_uid,
          propertyUid: seeds.prop1.property_uid,
        },
      });
      expect(reapplyOld.json().eligible).toBe(false);
      expect(reapplyOld.json().failedRules.some((r: string) => r.includes('already disbursed'))).toBe(true);
    });
  });

  describe('4. Idempotency Key Replay', () => {
    it('returns identical cached response when repeating mutating call with same idempotency key', async () => {
      const key = `IDEM-TEST-${Date.now()}`;
      const payload = {
        applicantPersonUid: seeds.childB.person_uid,
        schemeCode: 'SCHOLARSHIP_MERIT',
      };

      const res1 = await server.inject({
        method: 'POST',
        url: '/v1/applications',
        headers: {
          authorization: `Bearer ${citizenToken}`,
          'idempotency-key': key,
        },
        payload,
      });
      expect(res1.statusCode).toBe(201);
      const appNumber = res1.json().applicationNumber;

      // Repeat with same key
      const res2 = await server.inject({
        method: 'POST',
        url: '/v1/applications',
        headers: {
          authorization: `Bearer ${citizenToken}`,
          'idempotency-key': key,
        },
        payload,
      });
      expect(res2.statusCode).toBe(201);
      expect(res2.json().applicationNumber).toBe(appNumber);
    });
  });

  describe('5. Four-Eyes Approval and DBT Disbursement', () => {
    it('requires two distinct officers for high-value or high-risk applications', async () => {
      // PMAY Housing application (₹1,20,000 -> requires four eyes)
      const appRes = await server.inject({
        method: 'POST',
        url: '/v1/applications',
        headers: { authorization: `Bearer ${citizenToken}` },
        payload: {
          applicantPersonUid: seeds.brotherB.person_uid,
          schemeCode: 'PMAY_HOUSING',
        },
      });
      expect(appRes.statusCode).toBe(201);
      const appId = appRes.json().applicationId;

      // 1st approval by Officer 1
      const rev1 = await server.inject({
        method: 'POST',
        url: `/v1/applications/${appId}/review`,
        headers: { authorization: `Bearer ${officer1Token}` },
        payload: {
          decision: 'APPROVE',
          reason: 'First stage land title verification complete.',
        },
      });
      expect(rev1.statusCode).toBe(200);
      expect(rev1.json().status).toBe('UNDER_VERIFICATION'); // Not yet disbursed!

      // Same officer tries to give 2nd approval -> must be rejected (403)
      const revSame = await server.inject({
        method: 'POST',
        url: `/v1/applications/${appId}/review`,
        headers: { authorization: `Bearer ${officer1Token}` },
        payload: {
          decision: 'APPROVE',
          reason: 'Trying to self-approve second step.',
        },
      });
      expect(revSame.statusCode).toBe(403);
      expect(revSame.json().detail).toContain('Four-eyes violation');

      // Different officer (Officer 2) gives 2nd approval -> moves to APPROVED & DISBURSED!
      const rev2 = await server.inject({
        method: 'POST',
        url: `/v1/applications/${appId}/review`,
        headers: { authorization: `Bearer ${officer2Token}` },
        payload: {
          decision: 'APPROVE',
          reason: 'Secondary supervisory verification cleared.',
        },
      });
      expect(rev2.statusCode).toBe(200);
      expect(rev2.json().status).toBe('DISBURSED');
    });
  });

  describe('6. Immutability & Hard Delete Blocker', () => {
    it('throws error when attempting hard delete on bitemporal table', () => {
      expect(() => {
        db.delete('persons', () => true);
      }).toThrow('Hard deletes forbidden');
    });
  });
});
