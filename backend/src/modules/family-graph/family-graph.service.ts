import jwt from 'jsonwebtoken';
import qrcode from 'qrcode';
import { db } from '../../core/database/db';
import { config } from '../../config';
import { NotFoundError } from '../../core/errors/rfc9457';

export interface GraphNode {
  id: string;
  label: string;
  gender: string;
  dob: string;
  district: string;
  incomeCategory?: string;
  totalBenefitsReceived: number;
  benefitsList: Array<{ schemeId: string; amount: number; date: string }>;
}

export interface GraphEdge {
  from: string;
  to: string;
  relationship: string;
}

export class FamilyGraphService {
  // Add family relationship
  addRelationship(personUid1: string, personUid2: string, type: 'PARENT' | 'CHILD' | 'SPOUSE' | 'SIBLING') {
    return db.insert('relationships', {
      person_uid_1: personUid1,
      person_uid_2: personUid2,
      relationship_type: type,
      valid_from: new Date().toISOString(),
      valid_to: '9999-12-31T23:59:59.000Z',
      recorded_from: new Date().toISOString(),
      recorded_to: '9999-12-31T23:59:59.000Z',
      is_current: true,
    });
  }

  // Get Family Graph with Benefit Annotations
  getFamilyGraph(personUid: string, depth = 2): { nodes: GraphNode[]; edges: GraphEdge[] } {
    const persons = db.getTable('persons');
    const relationships = db.getTable('relationships').filter((r) => r.is_current);
    const ledger = db.getTable('benefit_ledger');
    const households = db.getTable('households');
    const memberships = db.getTable('household_memberships');

    const visited = new Set<string>();
    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];
    const queue: Array<{ uid: string; currentDepth: number }> = [{ uid: personUid, currentDepth: 0 }];

    while (queue.length > 0) {
      const { uid, currentDepth } = queue.shift()!;
      if (visited.has(uid)) continue;
      visited.add(uid);

      const person = persons.find((p) => p.person_uid === uid && p.is_current);
      if (person) {
        // Collect person's benefits
        const personBenefits = ledger.filter((b) => b.person_uid === uid);
        const totalBenefits = personBenefits.reduce((acc, curr) => acc + Number(curr.amount || 0), 0);

        // Find household income category
        const mem = memberships.find((m) => m.person_uid === uid && m.is_current);
        const hh = mem ? households.find((h) => h.household_uid === mem.household_uid && h.is_current) : null;

        nodes.push({
          id: person.person_uid,
          label: person.full_name,
          gender: person.gender,
          dob: person.date_of_birth,
          district: person.district,
          incomeCategory: hh?.income_category || 'APL',
          totalBenefitsReceived: totalBenefits,
          benefitsList: personBenefits.map((b) => ({
            schemeId: b.scheme_id,
            amount: Number(b.amount),
            date: b.disbursed_at,
          })),
        });
      }

      if (currentDepth < depth) {
        // Find all connected relationships
        const connected = relationships.filter((r) => r.person_uid_1 === uid || r.person_uid_2 === uid);
        for (const rel of connected) {
          const neighbor = rel.person_uid_1 === uid ? rel.person_uid_2 : rel.person_uid_1;
          edges.push({
            from: rel.person_uid_1,
            to: rel.person_uid_2,
            relationship: rel.relationship_type,
          });

          if (!visited.has(neighbor)) {
            queue.push({ uid: neighbor, currentDepth: currentDepth + 1 });
          }
        }
      }
    }

    return { nodes, edges };
  }

  // Find Shortest Relationship Path (BFS)
  findRelationshipPath(fromUid: string, toUid: string): string[] | null {
    if (fromUid === toUid) return [fromUid];
    const relationships = db.getTable('relationships').filter((r) => r.is_current);
    const queue: Array<{ uid: string; path: string[] }> = [{ uid: fromUid, path: [fromUid] }];
    const visited = new Set<string>([fromUid]);

    while (queue.length > 0) {
      const { uid, path } = queue.shift()!;
      const connected = relationships.filter((r) => r.person_uid_1 === uid || r.person_uid_2 === uid);

      for (const rel of connected) {
        const neighbor = rel.person_uid_1 === uid ? rel.person_uid_2 : rel.person_uid_1;
        if (neighbor === toUid) {
          return [...path, neighbor];
        }
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push({ uid: neighbor, path: [...path, neighbor] });
        }
      }
    }

    return null;
  }

  // QR Family Benefit Card Generation
  async generateFamilyCard(householdUid: string) {
    const households = db.getTable('households');
    const hh = households.find((h) => h.household_uid === householdUid && h.is_current);
    if (!hh) throw new NotFoundError('Household not found');

    const memberships = db.getTable('household_memberships').filter((m) => m.household_uid === householdUid && m.is_current);
    const ledger = db.getTable('benefit_ledger').filter((b) => b.household_uid === householdUid);
    const cardToken = `QR-HH-${householdUid}-${Date.now().toString(36).toUpperCase()}`;

    // Create signed snapshot payload
    const snapshotPayload = {
      householdUid,
      propertyUid: hh.property_uid,
      headPersonUid: hh.head_person_uid,
      incomeCategory: hh.income_category,
      membersCount: memberships.length,
      cardToken,
      issuedAt: new Date().toISOString(),
    };

    const signedJwt = jwt.sign(snapshotPayload, config.jwt.secret, { expiresIn: '365d' });
    const qrDataUrl = await qrcode.toDataURL(signedJwt);

    const card = db.insert('family_cards', {
      household_uid: householdUid,
      card_token: cardToken,
      signed_snapshot_jwt: signedJwt,
      status: 'ACTIVE',
      issued_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 365 * 86400 * 1000).toISOString(),
    });

    return {
      cardId: card.id,
      cardToken,
      qrDataUrl,
      signedJwt,
      summary: {
        householdUid,
        incomeCategory: hh.income_category,
        totalBenefitsDisbursed: ledger.length,
      },
    };
  }

  // Scan QR Family Card (Supports online or offline verification)
  scanFamilyCard(signedJwt: string, callerRole: string) {
    try {
      const decoded = jwt.verify(signedJwt, config.jwt.secret) as any;
      const cards = db.getTable('family_cards');
      const card = cards.find((c) => c.card_token === decoded.cardToken);

      if (card && card.status === 'REVOKED') {
        return { valid: false, reason: 'This Family Card has been revoked by authorities.' };
      }

      // Fetch received and pending benefits
      const ledger = db.getTable('benefit_ledger').filter((b) => b.household_uid === decoded.householdUid);
      const applications = db.getTable('applications').filter(
        (a) => a.household_uid === decoded.householdUid && ['SUBMITTED', 'UNDER_VERIFICATION'].includes(a.status)
      );

      // Mask details if caller is ordinary field worker or citizen
      const isPrivileged = ['OFFICER', 'SENIOR_OFFICER', 'SYSTEM_ADMIN'].includes(callerRole);

      return {
        valid: true,
        householdUid: decoded.householdUid,
        incomeCategory: decoded.incomeCategory,
        membersCount: decoded.membersCount,
        issuedAt: decoded.issuedAt,
        offlineVerifiable: true,
        benefits: {
          received: ledger.map((b) => ({
            schemeId: b.scheme_id,
            grantUnit: b.grant_unit,
            amount: isPrivileged ? b.amount : 'REDACTED',
            disbursedAt: b.disbursed_at,
          })),
          pendingApplications: applications.map((a) => ({
            applicationNumber: a.application_number,
            schemeId: a.scheme_id,
            grantUnit: a.grant_unit,
            status: a.status,
          })),
        },
      };
    } catch (err: any) {
      return { valid: false, reason: 'Invalid or expired signature: ' + err.message };
    }
  }

  // Revoke Family Card
  revokeFamilyCard(cardToken: string) {
    const cards = db.getTable('family_cards');
    const card = cards.find((c) => c.card_token === cardToken);
    if (!card) throw new NotFoundError('Family card not found');
    card.status = 'REVOKED';
    return { success: true, message: 'Card revoked successfully' };
  }
}

export const familyGraphService = new FamilyGraphService();
