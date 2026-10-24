import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { db } from '../../core/database/db';
import { cryptoService } from '../../core/crypto/envelope';
import { auditTrustService } from '../audit-trust/audit.service';
import { config } from '../../config';
import { UnauthorizedError, ForbiddenError, ValidationError } from '../../core/errors/rfc9457';

export interface TokenPayload {
  userId: string;
  username: string;
  role: string;
  departmentId?: string;
  district?: string;
  personUid?: string;
  is2faVerified?: boolean;
}

export class AuthService {
  async register(params: {
    username: string;
    email: string;
    password: string;
    role: string;
    departmentId?: string;
    district?: string;
    personUid?: string;
  }) {
    const users = db.getTable('users');
    if (users.some((u) => u.username === params.username || u.email === params.email)) {
      throw new ValidationError('User with this username or email already exists');
    }

    const passwordHash = await cryptoService.hashPassword(params.password);
    const user = {
      id: crypto.randomUUID(),
      username: params.username,
      email: params.email,
      password_hash: passwordHash,
      role: params.role,
      department_id: params.departmentId || null,
      district: params.district || null,
      person_uid: params.personUid || null,
      totp_secret: null,
      totp_enabled: false,
      active: true,
      failed_attempts: 0,
      locked_until: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    users.push(user);
    auditTrustService.appendAuditLog({
      actor_id: user.id,
      actor_role: user.role,
      action: 'USER_REGISTERED',
      entity_type: 'USER',
      entity_id: user.id,
      details: { username: user.username, role: user.role },
    });

    return { id: user.id, username: user.username, email: user.email, role: user.role };
  }

  async login(params: {
    username: string;
    password: string;
    totpToken?: string;
    deviceInfo?: string;
    ipAddress?: string;
  }) {
    const users = db.getTable('users');
    const user = users.find((u) => u.username === params.username);
    if (!user || !user.active) {
      throw new UnauthorizedError('Invalid credentials');
    }

    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      throw new ForbiddenError('Account temporarily locked due to failed attempts');
    }

    const validPassword = await cryptoService.verifyPassword(params.password, user.password_hash);
    if (!validPassword) {
      user.failed_attempts = (user.failed_attempts || 0) + 1;
      if (user.failed_attempts >= 5) {
        user.locked_until = new Date(Date.now() + 15 * 60 * 1000).toISOString();
      }
      throw new UnauthorizedError('Invalid credentials');
    }

    user.failed_attempts = 0;

    // Check TOTP 2FA if enabled
    if (user.totp_enabled) {
      if (!params.totpToken) {
        return {
          requires2fa: true,
          userId: user.id,
          message: 'TOTP 2FA token required',
        };
      }
      const validTotp = cryptoService.verifyTotp(params.totpToken, user.totp_secret);
      if (!validTotp) {
        throw new UnauthorizedError('Invalid 2FA token');
      }
    }

    const tokens = this.createSession(user, params.deviceInfo, params.ipAddress);
    return {
      requires2fa: false,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        district: user.district,
        departmentId: user.department_id,
        personUid: user.person_uid,
      },
      ...tokens,
    };
  }

  createSession(user: any, deviceInfo?: string, ipAddress?: string) {
    const payload: TokenPayload = {
      userId: user.id,
      username: user.username,
      role: user.role,
      departmentId: user.department_id,
      district: user.district,
      personUid: user.person_uid || undefined,
      is2faVerified: !!user.totp_enabled,
    };

    const accessToken = jwt.sign(payload, config.jwt.secret, { expiresIn: '15m' });
    const refreshToken = crypto.randomUUID() + '.' + crypto.randomBytes(32).toString('hex');
    const refreshTokenHash = cryptoService.sha256(refreshToken);

    const sessions = db.getTable('sessions');
    sessions.push({
      id: crypto.randomUUID(),
      user_id: user.id,
      refresh_token_hash: refreshTokenHash,
      device_info: deviceInfo || 'Unknown',
      ip_address: ipAddress || '127.0.0.1',
      expires_at: new Date(Date.now() + 7 * 86400 * 1000).toISOString(),
      revoked: false,
      created_at: new Date().toISOString(),
    });

    return { accessToken, refreshToken, expiresIn: 900 };
  }

  // Refresh token rotation with reuse detection
  async refreshTokens(refreshToken: string) {
    const refreshTokenHash = cryptoService.sha256(refreshToken);
    const sessions = db.getTable('sessions');
    const session = sessions.find((s) => s.refresh_token_hash === refreshTokenHash);

    if (!session) {
      throw new UnauthorizedError('Invalid refresh token');
    }

    // Reuse detection: if this session was already revoked, someone is replaying an old refresh token!
    if (session.revoked) {
      // Invalidate all sessions for this user as a security measure
      sessions.forEach((s) => {
        if (s.user_id === session.user_id) s.revoked = true;
      });
      auditTrustService.appendAuditLog({
        actor_id: session.user_id,
        actor_role: 'SYSTEM',
        action: 'REFRESH_TOKEN_REUSE_DETECTED',
        entity_type: 'SESSION',
        entity_id: session.id,
        details: { message: 'Token reuse detected. All user sessions invalidated.' },
      });
      throw new ForbiddenError('Refresh token reuse detected. Please re-login.');
    }

    if (new Date(session.expires_at) < new Date()) {
      session.revoked = true;
      throw new UnauthorizedError('Refresh token expired');
    }

    // Invalidate old token
    session.revoked = true;

    // Issue new tokens
    const users = db.getTable('users');
    const user = users.find((u) => u.id === session.user_id);
    if (!user) throw new UnauthorizedError('User no longer exists');

    return this.createSession(user, session.device_info, session.ip_address);
  }

  // TOTP 2FA Setup
  enable2fa(userId: string) {
    const users = db.getTable('users');
    const user = users.find((u) => u.id === userId);
    if (!user) throw new UnauthorizedError('User not found');

    const secret = cryptoService.generateTotpSecret();
    const uri = cryptoService.generateTotpUri(user.username, secret);
    user.totp_secret = secret;
    return { secret, uri };
  }

  verifyAndActivate2fa(userId: string, token: string) {
    const users = db.getTable('users');
    const user = users.find((u) => u.id === userId);
    if (!user || !user.totp_secret) throw new ValidationError('2FA not initiated');

    const isValid = cryptoService.verifyTotp(token, user.totp_secret);
    if (!isValid) throw new ValidationError('Invalid 2FA code');

    user.totp_enabled = true;
    return { success: true };
  }

  // ABAC / Scope verification
  verifyScope(user: TokenPayload, targetDistrict?: string, targetDepartment?: string): boolean {
    if (['SYSTEM_ADMIN', 'AUDITOR'].includes(user.role)) return true;
    if (user.district && targetDistrict && user.district !== targetDistrict) return false;
    if (user.departmentId && targetDepartment && user.departmentId !== targetDepartment) return false;
    return true;
  }

  // Break-glass emergency access
  breakGlassAccess(user: TokenPayload, personUid: string, reason: string): boolean {
    if (!reason || reason.trim().length < 10) {
      throw new ValidationError('A detailed reason (minimum 10 characters) is mandatory for break-glass emergency access');
    }

    auditTrustService.logAccess({
      person_uid: personUid,
      accessor_user_id: user.userId,
      accessor_role: user.role,
      purpose: 'EMERGENCY_BREAK_GLASS',
      department_id: user.departmentId,
      accessed_fields: ['ALL_FIELDS'],
      is_break_glass: true,
      break_glass_reason: reason,
    });

    auditTrustService.appendAuditLog({
      actor_id: user.userId,
      actor_role: user.role,
      action: 'BREAK_GLASS_ACCESS_TRIGGERED',
      entity_type: 'PERSON',
      entity_id: personUid,
      details: { reason, user: user.username },
    });

    return true;
  }
}

export const authService = new AuthService();
