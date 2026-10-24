import { db } from '../../core/database/db';
import { cryptoService } from '../../core/crypto/envelope';
import { NotFoundError, ValidationError, ForbiddenError } from '../../core/errors/rfc9457';

export class ConsentPrivacyService {
  // Grant purpose-bound consent
  grantConsent(params: {
    personUid: string;
    departmentId: string;
    purpose: string;
    permittedFields: string[];
    validDays?: number;
  }) {
    const validDays = params.validDays || 90;
    const consent = db.insert('consents', {
      person_uid: params.personUid,
      department_id: params.departmentId,
      purpose: params.purpose,
      permitted_fields: params.permittedFields,
      valid_from: new Date().toISOString(),
      valid_to: new Date(Date.now() + validDays * 86400 * 1000).toISOString(),
      is_revoked: false,
      revoked_at: null,
    });
    return consent;
  }

  // Revoke consent
  revokeConsent(consentId: string, personUid: string) {
    const consents = db.getTable('consents');
    const consent = consents.find((c) => c.id === consentId && c.person_uid === personUid);
    if (!consent) throw new NotFoundError('Consent record not found');

    consent.is_revoked = true;
    consent.revoked_at = new Date().toISOString();
    return { success: true, message: 'Consent revoked successfully' };
  }

  // Check if department has valid unrevoked consent
  hasConsent(personUid: string, departmentId: string, purpose: string): boolean {
    const consents = db.getTable('consents');
    const match = consents.find(
      (c) =>
        c.person_uid === personUid &&
        c.department_id === departmentId &&
        c.purpose === purpose &&
        !c.is_revoked &&
        new Date(c.valid_to) > new Date()
    );
    return !!match;
  }

  // Privacy-preserving cross-department match (Returns match: boolean and masked reference only, no raw PII)
  privacyPreservingCheck(params: {
    hmacHash: string;
    idType: string;
    requestingDepartmentId: string;
    purpose: string;
  }): { match: boolean; referenceId?: string } {
    const identifiers = db.getTable('identifiers');
    const found = identifiers.find(
      (idObj) => idObj.id_type === params.idType && idObj.id_hash_hmac === params.hmacHash
    );

    if (!found) {
      return { match: false };
    }

    return {
      match: true,
      referenceId: `REF-${cryptoService.sha256(found.person_uid).substring(0, 10)}`,
    };
  }

  // File Right-to-Correction request
  fileCorrectionRequest(params: {
    personUid: string;
    fieldName: string;
    requestedValue: string;
    evidenceDocumentId?: string;
  }) {
    return db.insert('correction_requests', {
      person_uid: params.personUid,
      field_name: params.fieldName,
      requested_value: params.requestedValue,
      evidence_document_id: params.evidenceDocumentId || null,
      status: 'SUBMITTED',
      reviewed_by: null,
      resolved_at: null,
    });
  }

  // Review Correction Request (If approved, applies bitemporal update to person record!)
  reviewCorrection(params: {
    requestId: string;
    reviewerUserId: string;
    status: 'APPROVED' | 'REJECTED';
  }) {
    const requests = db.getTable('correction_requests');
    const req = requests.find((r) => r.id === params.requestId);
    if (!req) throw new NotFoundError('Correction request not found');

    req.status = params.status;
    req.reviewed_by = params.reviewerUserId;
    req.resolved_at = new Date().toISOString();

    if (params.status === 'APPROVED') {
      // Apply bitemporal update
      db.bitemporalUpdate('persons', 'person_uid', req.person_uid, {
        [req.field_name]: req.requested_value,
      });
    }

    return req;
  }
}

export const consentPrivacyService = new ConsentPrivacyService();
