import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authService, TokenPayload } from '../../modules/identity-access/auth.service';
import { recordsService } from '../../modules/records/records.service';
import { familyGraphService } from '../../modules/family-graph/family-graph.service';
import { rulesEngineService } from '../../modules/schemes-rules/rules-engine.service';
import { applicationsWorkflowService } from '../../modules/applications-workflow/workflow.service';
import { duplicateFraudIntelService } from '../../modules/duplicate-intel/duplicate-intel.service';
import { documentsService } from '../../modules/documents/documents.service';
import { consentPrivacyService } from '../../modules/consent-privacy/consent.service';
import { auditTrustService } from '../../modules/audit-trust/audit.service';
import { integrationsService } from '../../modules/integrations/integrations.service';
import { analyticsSimulationService } from '../../modules/analytics-simulation/analytics.service';
import { db } from '../../core/database/db';
import { register } from '../../core/telemetry/metrics';
import { AppError, UnauthorizedError, ForbiddenError, ValidationError } from '../../core/errors/rfc9457';
import jwt from 'jsonwebtoken';
import { config } from '../../config';

// Helper to extract JWT user
export function authenticate(req: FastifyRequest): TokenPayload {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new UnauthorizedError('Missing or malformed Authorization header');
  }
  const token = authHeader.substring(7);
  try {
    return jwt.verify(token, config.jwt.secret) as TokenPayload;
  } catch (err: any) {
    throw new UnauthorizedError('Invalid or expired token: ' + err.message);
  }
}

export const STAFF_ROLES = ['CLERK', 'OFFICER', 'SENIOR_OFFICER', 'FIELD_WORKER', 'DEPT_ADMIN', 'AUDITOR', 'SYSTEM_ADMIN'];

// RBAC guard
export function requireRole(req: FastifyRequest, roles: string[]): TokenPayload {
  const user = authenticate(req);
  if (!roles.includes(user.role)) {
    throw new ForbiddenError(`Role ${user.role} is not permitted to perform this action`);
  }
  return user;
}

// Current household members of a person (used to let a citizen act for own family)
export function currentHouseholdMembers(personUid: string): string[] {
  const memberships = db.getTable('household_memberships');
  const hhUids = memberships.filter((m) => m.person_uid === personUid && m.is_current !== false).map((m) => m.household_uid);
  return memberships
    .filter((m) => hhUids.includes(m.household_uid) && m.is_current !== false)
    .map((m) => m.person_uid);
}

// Citizens may only touch their own record (or their current household's); staff pass through
export function ensureSelfOrStaff(user: TokenPayload, personUid: string, allowHousehold = false) {
  if (user.role !== 'CITIZEN') return;
  if (user.personUid === personUid) return;
  if (allowHousehold && user.personUid && currentHouseholdMembers(user.personUid).includes(personUid)) return;
  throw new ForbiddenError('Citizens can only access their own records');
}

export async function registerRoutes(app: FastifyInstance) {
  // Observability & Health
  app.get('/health', async () => ({ status: 'UP', timestamp: new Date().toISOString() }));
  app.get('/healthz', async () => ({ status: 'UP', timestamp: new Date().toISOString() }));
  app.get('/ready', async () => ({ status: 'READY', database: 'CONNECTED', queue: 'READY' }));
  app.get('/metrics', async (req, reply) => {
    reply.header('Content-Type', register.contentType);
    return register.metrics();
  });

  // 1. AUTH & IDENTITY
  app.post('/v1/auth/register', async (req, reply) => {
    const body = (req.body || {}) as any;
    // Only admins may create staff accounts; self-registration is CITIZEN only
    if (body.role && body.role !== 'CITIZEN') {
      requireRole(req, ['SYSTEM_ADMIN', 'DEPT_ADMIN']);
    }
    const res = await authService.register({ ...body, role: body.role || 'CITIZEN' });
    return reply.status(201).send(res);
  });

  app.post('/v1/auth/login', async (req) => {
    return authService.login(req.body as any);
  });

  app.post('/v1/auth/refresh', async (req) => {
    const body = req.body as any;
    if (!body?.refreshToken) throw new ValidationError('refreshToken is required');
    return authService.refreshTokens(body.refreshToken);
  });

  app.post('/v1/auth/2fa/setup', async (req) => {
    const user = authenticate(req);
    return authService.enable2fa(user.userId);
  });

  app.post('/v1/auth/2fa/verify', async (req) => {
    const user = authenticate(req);
    const body = req.body as any;
    if (!body?.token) throw new ValidationError('token is required');
    return authService.verifyAndActivate2fa(user.userId, body.token);
  });

  app.post('/v1/auth/break-glass', async (req) => {
    const user = authenticate(req);
    const body = req.body as any;
    authService.breakGlassAccess(user, body.personUid, body.reason);
    return { success: true, message: 'Emergency break-glass access granted and flagged for audit.' };
  });

  // 2. RECORDS & PERSONS
  app.post('/v1/persons', async (req, reply) => {
    const res = await recordsService.createPerson(req.body as any);
    return reply.status(201).send(res);
  });

  app.get('/v1/persons/:uid', async (req: FastifyRequest<{ Params: { uid: string } }>) => {
    const user = authenticate(req);
    const persons = db.getTable('persons');
    const person = persons.find((p) => p.person_uid === req.params.uid && p.is_current);
    if (!person) throw new AppError({ status: 404, title: 'Not Found', detail: 'Person not found' });

    // ABAC District scoping check
    if (!authService.verifyScope(user, person.district)) {
      throw new ForbiddenError(`ABAC violation: User district (${user.district}) cannot access records in district (${person.district}). Use break-glass if authorized.`);
    }

    // Audit log access
    auditTrustService.logAccess({
      person_uid: person.person_uid,
      accessor_user_id: user.userId,
      accessor_role: user.role,
      purpose: 'OFFICIAL_PERSON_LOOKUP',
      department_id: user.departmentId,
      accessed_fields: ['FULL_NAME', 'ADDRESS', 'DOB', 'DISTRICT'],
    });

    return person;
  });

  app.get('/v1/persons/:uid/timeline', async (req: FastifyRequest<{ Params: { uid: string } }>) => {
    const user = authenticate(req);
    ensureSelfOrStaff(user, req.params.uid, true);
    return recordsService.getPersonTimeline(req.params.uid);
  });

  app.post('/v1/properties', async (req, reply) => {
    const res = recordsService.createProperty(req.body as any);
    return reply.status(201).send(res);
  });

  app.post('/v1/households', async (req, reply) => {
    const res = recordsService.createHousehold(req.body as any);
    return reply.status(201).send(res);
  });

  app.post('/v1/life-events', async (req, reply) => {
    requireRole(req, ['CLERK', 'OFFICER', 'SENIOR_OFFICER', 'DEPT_ADMIN', 'SYSTEM_ADMIN']);
    const res = await recordsService.executeLifeEvent(req.body as any);
    return reply.status(201).send(res);
  });

  // 3. FAMILY GRAPH & QR FAMILY CARD
  app.get('/v1/family-graph/:uid', async (req: FastifyRequest<{ Params: { uid: string }; Querystring: { depth?: string } }>) => {
    const user = authenticate(req);
    ensureSelfOrStaff(user, req.params.uid, true);
    const depth = req.query.depth ? parseInt(req.query.depth, 10) : 2;
    return familyGraphService.getFamilyGraph(req.params.uid, depth);
  });

  app.get('/v1/family-graph/path', async (req: FastifyRequest<{ Querystring: { fromUid: string; toUid: string } }>) => {
    authenticate(req);
    const path = familyGraphService.findRelationshipPath(req.query.fromUid, req.query.toUid);
    return { path, found: !!path };
  });

  app.post('/v1/family-cards/generate', async (req) => {
    authenticate(req);
    const body = req.body as any;
    return familyGraphService.generateFamilyCard(body.householdUid);
  });

  app.post('/v1/family-cards/scan', async (req) => {
    const user = authenticate(req);
    const body = req.body as any;
    return familyGraphService.scanFamilyCard(body.signedJwt, user.role);
  });

  app.post('/v1/family-cards/revoke', async (req) => {
    authenticate(req);
    const body = req.body as any;
    return familyGraphService.revokeFamilyCard(body.cardToken);
  });

  // 4. SCHEMES & RULES
  app.get('/v1/schemes', async () => {
    const schemes = db.getTable('schemes').filter((s) => s.active);
    const versions = db.getTable('scheme_versions');
    return schemes.map((s) => {
      const v = versions.find((ver) => ver.scheme_id === s.id && ver.is_active);
      return {
        ...s,
        max_benefit_amount: v?.benefit_amount || 0,
        benefit_amount: v?.benefit_amount || 0,
        rules_dsl: v?.rules_dsl || {},
      };
    });
  });

  app.post('/v1/schemes/evaluate', async (req) => {
    return rulesEngineService.evaluateEligibility(req.body as any);
  });

  app.get('/v1/schemes/proactive/:personUid', async (req: FastifyRequest<{ Params: { personUid: string } }>) => {
    return rulesEngineService.findProactiveEligibleSchemes(req.params.personUid);
  });

  app.post('/v1/schemes/bundles/evaluate', async (req) => {
    const body = req.body as any;
    return rulesEngineService.evaluateBundle(body.bundleCode, body.applicantPersonUid);
  });

  // 5. APPLICATIONS & WORKFLOW
  app.post('/v1/applications', async (req, reply) => {
    const user = authenticate(req);
    const idempotencyKey = (req.headers['idempotency-key'] as string) || undefined;
    const body = req.body as any;
    if (!body?.applicantPersonUid || !body?.schemeCode) {
      throw new ValidationError('applicantPersonUid and schemeCode are required');
    }
    // A citizen may file for self or a member of their current household (e.g. a child)
    ensureSelfOrStaff(user, body.applicantPersonUid, true);
    const res = await applicationsWorkflowService.submitApplication({
      ...body,
      idempotencyKey,
    });
    return reply.status(201).send(res);
  });

  app.get('/v1/applications/review-queue', async (req: FastifyRequest<{ Querystring: { district?: string; status?: string } }>) => {
    const user = requireRole(req, STAFF_ROLES);
    const districtFilter = user.district || req.query.district;
    return applicationsWorkflowService.getReviewQueue({ district: districtFilter, status: req.query.status, role: user.role });
  });

  app.post('/v1/applications/:id/review', async (req: FastifyRequest<{ Params: { id: string } }>) => {
    const user = requireRole(req, ['OFFICER', 'SENIOR_OFFICER', 'DEPT_ADMIN', 'SYSTEM_ADMIN']);
    const body = req.body as any;
    return applicationsWorkflowService.reviewApplication({
      applicationId: req.params.id,
      officerUserId: user.userId,
      officerRole: user.role,
      decision: body.decision,
      reason: body.reason,
      noteEn: body.noteEn,
      noteHi: body.noteHi,
    });
  });

  app.get('/v1/applications/:appNumber/tracking', async (req: FastifyRequest<{ Params: { appNumber: string } }>) => {
    const user = authenticate(req);
    const owned = db.getTable('applications').find((a) => a.application_number === req.params.appNumber);
    if (owned) ensureSelfOrStaff(user, owned.applicant_person_uid, true);
    return applicationsWorkflowService.getApplicationTracking(req.params.appNumber);
  });

  app.post('/v1/applications/:id/appeal', async (req: FastifyRequest<{ Params: { id: string } }>) => {
    const user = authenticate(req);
    const body = req.body as any;
    return applicationsWorkflowService.fileAppeal({
      applicationId: req.params.id,
      grounds: body.grounds,
      appellantPersonUid: body.appellantPersonUid || user.userId,
    });
  });

  app.post('/v1/appeals/:id/review', async (req: FastifyRequest<{ Params: { id: string } }>) => {
    const user = requireRole(req, ['OFFICER', 'SENIOR_OFFICER', 'SYSTEM_ADMIN']);
    const body = req.body as any;
    return applicationsWorkflowService.reviewAppeal({
      appealId: req.params.id,
      reviewingOfficerId: user.userId,
      decision: body.decision,
      reason: body.reason,
    });
  });

  // 6. DUPLICATE & FRAUD INTEL
  app.get('/v1/fraud/rings', async (req) => {
    requireRole(req, STAFF_ROLES);
    return duplicateFraudIntelService.detectFraudRings();
  });

  app.get('/v1/fraud/officer-anomalies', async (req) => {
    requireRole(req, ['AUDITOR', 'SENIOR_OFFICER', 'SYSTEM_ADMIN', 'DEPT_ADMIN']);
    return duplicateFraudIntelService.detectOfficerAnomalies();
  });

  app.post('/v1/fraud/entity-resolution/check', async (req) => {
    authenticate(req);
    return duplicateFraudIntelService.evaluateApplicationRisk(req.body as any);
  });

  // 7. DOCUMENTS & WALLET
  app.post('/v1/documents/upload', async (req, reply) => {
    const user = authenticate(req);
    const body = req.body as any;
    const { docType, filename, mimeType, dataBase64 } = body;
    if (!docType || !filename || !dataBase64) throw new ValidationError('docType, filename and dataBase64 are required');
    const targetPerson = user.role === 'CITIZEN' ? user.personUid : body.personUid;
    if (!targetPerson) throw new ValidationError('personUid is required');
    const buffer = Buffer.from(dataBase64, 'base64');
    const res = await documentsService.uploadToWallet({
      personUid: user.role === 'CITIZEN' ? (user.personUid as string) : body.personUid,
      docType,
      filename,
      mimeType: mimeType || 'application/pdf',
      data: buffer,
    });
    return reply.status(201).send(res);
  });

  app.get('/v1/documents/wallet/:personUid', async (req: FastifyRequest<{ Params: { personUid: string } }>) => {
    const user = authenticate(req);
    ensureSelfOrStaff(user, req.params.personUid, true);
    return documentsService.getCitizenWallet(req.params.personUid);
  });

  app.post('/v1/documents/:id/verify', async (req: FastifyRequest<{ Params: { id: string } }>) => {
    requireRole(req, STAFF_ROLES);
    const body = req.body as any;
    return documentsService.verifyDocument(req.params.id, body.status);
  });

  // 8. CONSENT & PRIVACY
  app.post('/v1/consent/grant', async (req) => {
    authenticate(req);
    return consentPrivacyService.grantConsent(req.body as any);
  });

  app.post('/v1/consent/revoke', async (req) => {
    authenticate(req);
    const body = req.body as any;
    return consentPrivacyService.revokeConsent(body.consentId, body.personUid);
  });

  app.post('/v1/privacy/cross-dept-check', async (req) => {
    return consentPrivacyService.privacyPreservingCheck(req.body as any);
  });

  app.post('/v1/correction/request', async (req) => {
    authenticate(req);
    return consentPrivacyService.fileCorrectionRequest(req.body as any);
  });

  app.post('/v1/correction/:id/review', async (req: FastifyRequest<{ Params: { id: string } }>) => {
    const user = requireRole(req, ['OFFICER', 'SENIOR_OFFICER', 'SYSTEM_ADMIN']);
    const body = req.body as any;
    return consentPrivacyService.reviewCorrection({
      requestId: req.params.id,
      reviewerUserId: user.userId,
      status: body.status,
    });
  });

  // 9. AUDIT & TRUST
  app.get('/v1/audit/verify', async () => {
    return auditTrustService.verifyAuditChain();
  });

  app.post('/v1/audit/checkpoints', async (req) => {
    requireRole(req, ['AUDITOR', 'SYSTEM_ADMIN']);
    return auditTrustService.createMerkleCheckpoint();
  });

  app.get('/v1/audit/proof/:seq', async (req: FastifyRequest<{ Params: { seq: string } }>) => {
    return auditTrustService.getInclusionProof(parseInt(req.params.seq, 10));
  });

  app.get('/v1/audit/access-history/:personUid', async (req: FastifyRequest<{ Params: { personUid: string } }>) => {
    const user = authenticate(req);
    ensureSelfOrStaff(user, req.params.personUid);
    return auditTrustService.getAccessHistory(req.params.personUid);
  });

  // 10. INTEGRATIONS & CHANNELS
  app.post('/v1/integrations/webhooks/civil-registration', async (req) => {
    return integrationsService.handleCivilRegistrationWebhook(req.body as any);
  });

  app.post('/v1/integrations/ivr', async (req) => {
    return integrationsService.handleIvrWebhook(req.body as any);
  });

  app.post('/v1/channels/otp/request', async (req) => {
    const body = req.body as any;
    return integrationsService.requestStatusOtp(body.applicationNumber, body.phone);
  });

  app.post('/v1/channels/otp/verify', async (req) => {
    const body = req.body as any;
    return integrationsService.verifyStatusOtpAndGetTracking(body.applicationNumber, body.otp);
  });

  // 11. ANALYTICS & SIMULATION
  app.get('/v1/analytics/dashboard', async () => {
    return analyticsSimulationService.getPlatformAnalytics();
  });

  app.post('/v1/simulations/run', async (req) => {
    return analyticsSimulationService.runWhatIfSimulation(req.body as any);
  });
}
