import { db } from '../../core/database/db';
import { cryptoService } from '../../core/crypto/envelope';

export interface RiskEvaluation {
  riskScore: 'LOW' | 'MEDIUM' | 'HIGH';
  compositeScore: number;
  factors: Array<{ factor: string; weight: number; detected: boolean; details: string }>;
  isFlaggedDuplicate: boolean;
  evidencePack?: {
    matchedEntityUid?: string;
    matchedType: string;
    details: string;
    priorDisbursement?: any;
    explanationEn: string;
    explanationHi: string;
  };
}

export class DuplicateFraudIntelService {
  // Transliteration-aware Indian Name Normalization
  normalizeIndianName(name: string): string {
    return name
      .toLowerCase()
      .trim()
      .replace(/\b(kumar|singh|sharma|verma|devi|yadav|lal|bai|patel|gupta)\b/g, '') // common surnames/affixes
      .replace(/sh/g, 's')
      .replace(/ph/g, 'f')
      .replace(/ee/g, 'i')
      .replace(/oo/g, 'u')
      .replace(/v/g, 'w')
      .replace(/ch/g, 'c')
      .replace(/[^a-z]/g, '');
  }

  // Jaro-Winkler string similarity (0.0 to 1.0)
  jaroWinklerSimilarity(s1: string, s2: string): number {
    if (s1 === s2) return 1.0;
    const len1 = s1.length;
    const len2 = s2.length;
    if (len1 === 0 || len2 === 0) return 0.0;

    const matchDistance = Math.floor(Math.max(len1, len2) / 2) - 1;
    const s1Matches = new Array(len1).fill(false);
    const s2Matches = new Array(len2).fill(false);

    let matches = 0;
    for (let i = 0; i < len1; i++) {
      const start = Math.max(0, i - matchDistance);
      const end = Math.min(i + matchDistance + 1, len2);
      for (let j = start; j < end; j++) {
        if (!s2Matches[j] && s1[i] === s2[j]) {
          s1Matches[i] = true;
          s2Matches[j] = true;
          matches++;
          break;
        }
      }
    }

    if (matches === 0) return 0.0;

    let transpositions = 0;
    let k = 0;
    for (let i = 0; i < len1; i++) {
      if (s1Matches[i]) {
        while (!s2Matches[k]) k++;
        if (s1[i] !== s2[k]) transpositions++;
        k++;
      }
    }

    const jaro = (matches / len1 + matches / len2 + (matches - transpositions / 2) / matches) / 3;

    // Winkler prefix adjustment
    let prefix = 0;
    for (let i = 0; i < Math.min(4, Math.min(len1, len2)); i++) {
      if (s1[i] === s2[i]) prefix++;
      else break;
    }

    return jaro + prefix * 0.1 * (1 - jaro);
  }

  // Perceptual hash hamming distance
  hammingDistance(hex1: string, hex2: string): number {
    if (!hex1 || !hex2 || hex1.length !== hex2.length) return 999;
    let dist = 0;
    for (let i = 0; i < hex1.length; i++) {
      const b1 = parseInt(hex1[i], 16);
      const b2 = parseInt(hex2[i], 16);
      let xor = b1 ^ b2;
      while (xor > 0) {
        dist += xor & 1;
        xor >>= 1;
      }
    }
    return dist;
  }

  // Full Entity Resolution & Fraud Scoring for an Application
  evaluateApplicationRisk(params: {
    applicantPersonUid: string;
    schemeId: string;
    householdUid?: string;
    propertyUid?: string;
    bankAccount?: string;
    phone?: string;
    proofPhotoPhash?: string;
    exifData?: any;
  }): RiskEvaluation {
    const persons = db.getTable('persons');
    const applicant = persons.find((p) => p.person_uid === params.applicantPersonUid && p.is_current);

    const factors: RiskEvaluation['factors'] = [];
    let compositeScore = 0;
    let isFlaggedDuplicate = false;
    let evidencePack: RiskEvaluation['evidencePack'] = undefined;

    // 1. Fuzzy Entity Resolution on Names & Addresses
    if (applicant) {
      const applicantNormName = this.normalizeIndianName(applicant.full_name);
      const otherPersons = persons.filter((p) => p.person_uid !== applicant.person_uid && p.is_current);

      for (const other of otherPersons) {
        const otherNorm = this.normalizeIndianName(other.full_name);
        const nameSim = this.jaroWinklerSimilarity(applicantNormName, otherNorm);
        const addrSim = this.jaroWinklerSimilarity(
          applicant.address_line.toLowerCase().replace(/[^a-z0-9]/g, ''),
          other.address_line.toLowerCase().replace(/[^a-z0-9]/g, '')
        );

        if (nameSim > 0.85 && addrSim > 0.75) {
          compositeScore += 40;
          factors.push({
            factor: 'FUZZY_NAME_ADDRESS_MATCH',
            weight: 40,
            detected: true,
            details: `High similarity with existing citizen ${other.full_name} (${other.person_uid}): Name ${Math.round(nameSim * 100)}%, Address ${Math.round(addrSim * 100)}%`,
          });
          isFlaggedDuplicate = true;
          evidencePack = {
            matchedEntityUid: other.person_uid,
            matchedType: 'FUZZY_PERSON_MATCH',
            details: `Fuzzy resolution identified probable duplicate identity for ${applicant.full_name} matching ${other.full_name}`,
            explanationEn: `A potential duplicate profile was identified matching ${other.full_name}. Official review required before processing.`,
            explanationHi: `Potential duplicate profile detected. Officer review required before processing.`,
          };
          break;
        }
      }
    }

    // 2. Photo Perceptual Hash (pHash) reuse detection
    if (params.proofPhotoPhash) {
      const docs = db.getTable('documents');
      const allPersons = persons.filter((p) => p.photo_phash && p.person_uid !== params.applicantPersonUid);

      for (const p of allPersons) {
        const dist = this.hammingDistance(params.proofPhotoPhash, p.photo_phash);
        if (dist <= 5) {
          // Near identical image
          compositeScore += 50;
          isFlaggedDuplicate = true;
          factors.push({
            factor: 'PHOTO_HASH_REUSE_DETECTED',
            weight: 50,
            detected: true,
            details: `Perceptual hash collision (hamming distance ${dist}) with photo submitted by ${p.full_name} (${p.person_uid})`,
          });
          evidencePack = {
            matchedEntityUid: p.person_uid,
            matchedType: 'PHOTO_PROOF_REUSE',
            details: `Perceptual image comparison revealed proof image reused from citizen ${p.person_uid}`,
            explanationEn: `The uploaded verification photograph matches an image previously submitted in another profile.`,
            explanationHi: `Uploaded verification photo matches an image previously submitted in another profile.`,
          };
          break;
        }
      }
    }

    // 3. EXIF Date & Geo Sanity
    if (params.exifData) {
      if (params.exifData.dateTimeOriginal) {
        const photoDate = new Date(params.exifData.dateTimeOriginal);
        const daysAgo = (Date.now() - photoDate.getTime()) / (1000 * 86400);
        if (daysAgo > 365) {
          compositeScore += 20;
          factors.push({
            factor: 'STALE_PHOTO_PROOF',
            weight: 20,
            detected: true,
            details: `EXIF timestamp shows photo is older than 1 year (${Math.round(daysAgo)} days old)`,
          });
        }
      }
    }

    // 4. Shared Bank Account / Phone across multiple households (Fraud Ring detector)
    if (params.bankAccount) {
      const bankHash = cryptoService.hmacHash(params.bankAccount);
      const identifiers = db.getTable('identifiers');
      const sharedBankAccounts = identifiers.filter(
        (id) => id.id_type === 'BANK_ACCOUNT' && id.id_hash_hmac === bankHash && id.person_uid !== params.applicantPersonUid
      );

      if (sharedBankAccounts.length >= 2) {
        compositeScore += 60;
        isFlaggedDuplicate = true;
        factors.push({
          factor: 'SHARED_BANK_ACCOUNT_FRAUD_RING',
          weight: 60,
          detected: true,
          details: `Bank account shared with ${sharedBankAccounts.length} other unrelated citizen profiles.`,
        });
        evidencePack = {
          matchedType: 'FRAUD_RING_SUSPECT',
          details: `Same disbursement bank account hash linked across ${sharedBankAccounts.length + 1} distinct applicants`,
          explanationEn: `This bank account number is already linked to multiple independent applicant records.`,
          explanationHi: `This bank account number is already linked to multiple independent applicant records.`,
        };
      }
    }

    // Determine final risk rating
    let riskScore: 'LOW' | 'MEDIUM' | 'HIGH' = 'LOW';
    if (compositeScore >= 60 || isFlaggedDuplicate) {
      riskScore = 'HIGH';
    } else if (compositeScore >= 30) {
      riskScore = 'MEDIUM';
    }

    return {
      riskScore,
      compositeScore,
      factors,
      isFlaggedDuplicate,
      evidencePack,
    };
  }

  // Fraud Rings Graph Analytics
  detectFraudRings(): Array<{ clusterId: string; sharedIdentifierHash: string; entityCount: number; entities: string[]; confidence: string }> {
    const identifiers = db.getTable('identifiers');
    const hashMap = new Map<string, string[]>();

    for (const idObj of identifiers) {
      const key = `${idObj.id_type}:${idObj.id_hash_hmac}`;
      if (!hashMap.has(key)) hashMap.set(key, []);
      const list = hashMap.get(key)!;
      if (!list.includes(idObj.person_uid)) {
        list.push(idObj.person_uid);
      }
    }

    const rings: Array<{ clusterId: string; sharedIdentifierHash: string; entityCount: number; entities: string[]; confidence: string }> = [];

    for (const [key, entities] of hashMap.entries()) {
      if (entities.length >= 3) {
        rings.push({
          clusterId: `RING-${cryptoService.sha256(key).substring(0, 8)}`,
          sharedIdentifierHash: key,
          entityCount: entities.length,
          entities,
          confidence: entities.length >= 5 ? 'VERY_HIGH' : 'HIGH',
        });
      }
    }

    return rings;
  }

  // Officer-behaviour anomaly detection (Unusual approval rate, bulk viewing, off-hours access)
  detectOfficerAnomalies(): Array<{ officerId: string; anomalyType: string; severity: string; details: string }> {
    const reviews = db.getTable('reviews');
    const accessLogs = db.getTable('access_log');
    const anomalies: Array<{ officerId: string; anomalyType: string; severity: string; details: string }> = [];

    const officerReviews = new Map<string, { approvals: number; total: number }>();
    for (const r of reviews) {
      const current = officerReviews.get(r.officer_user_id) || { approvals: 0, total: 0 };
      current.total++;
      if (r.decision === 'APPROVE') current.approvals++;
      officerReviews.set(r.officer_user_id, current);
    }

    // 1. Check for 100% approval rate anomaly (> 10 applications)
    for (const [officerId, stats] of officerReviews.entries()) {
      if (stats.total >= 10 && stats.approvals / stats.total > 0.98) {
        anomalies.push({
          officerId,
          anomalyType: 'UNUSUAL_HIGH_APPROVAL_RATE',
          severity: 'HIGH',
          details: `Officer has an anomalous 98%+ approval rate (${stats.approvals}/${stats.total} approved) with no flagged checks.`,
        });
      }
    }

    // 2. Off-hours bulk data viewing (Access between 11 PM and 5 AM)
    const officerOffHours = new Map<string, number>();
    for (const acc of accessLogs) {
      const hour = new Date(acc.accessed_at).getHours();
      if (hour >= 23 || hour <= 4) {
        const count = (officerOffHours.get(acc.accessor_user_id) || 0) + 1;
        officerOffHours.set(acc.accessor_user_id, count);
      }
    }

    for (const [officerId, count] of officerOffHours.entries()) {
      if (count >= 5) {
        anomalies.push({
          officerId,
          anomalyType: 'OFF_HOURS_BULK_ACCESS',
          severity: 'MEDIUM',
          details: `Officer accessed citizen profiles ${count} times during non-working midnight hours (23:00-05:00).`,
        });
      }
    }

    return anomalies;
  }

  // AI Case Summarizer (5-line advisory summary for the officer, with deterministic template fallback)
  generateCaseSummary(application: any, applicant: any, riskEval: RiskEvaluation): {
    summaryEn: string;
    summaryHi: string;
    isAiGenerated: boolean;
  } {
    // Deterministic template fallback (advisory only, clearly labelled)
    const summaryEn = [
      `1. Applicant: ${applicant.full_name} (${applicant.person_uid}), residing at ${applicant.address_line}, District: ${applicant.district}.`,
      `2. Target Scheme: ${application.scheme_id} (${application.grant_unit} grant unit).`,
      `3. Automated Eligibility: Evaluation completed with status ${application.status}.`,
      `4. Risk Assessment: Risk Level is ${riskEval.riskScore} (Composite score: ${riskEval.compositeScore}/100).`,
      `5. Recommendation: ${riskEval.isFlaggedDuplicate ? 'FLAGGED: Manual identity verification recommended before DBT disbursement.' : 'Eligible for direct officer review.'}`,
    ].join('\n');

    const summaryHi = [
      `1. Applicant: ${applicant.full_name} (${applicant.person_uid}), Residing at: ${applicant.address_line}, District: ${applicant.district}.`,
      `2. Target Scheme: ${application.scheme_id} (${application.grant_unit} grant unit).`,
      `3. Automated Eligibility: Evaluation completed with status ${application.status}.`,
      `4. Risk Assessment: Risk Level is ${riskEval.riskScore} (Composite score: ${riskEval.compositeScore}/100).`,
      `5. Recommendation: ${riskEval.isFlaggedDuplicate ? 'FLAGGED: Direct officer verification required before DBT disbursement.' : 'Eligible for direct officer review.'}`
    ].join('\n');

    return {
      summaryEn,
      summaryHi,
      isAiGenerated: false,
    };
  }
}

export const duplicateFraudIntelService = new DuplicateFraudIntelService();
