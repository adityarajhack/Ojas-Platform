import { db } from '../../core/database/db';
import { cryptoService } from '../../core/crypto/envelope';
import { recordsService } from '../records/records.service';
import { applicationsWorkflowService } from '../applications-workflow/workflow.service';
import { UnauthorizedError, ValidationError, NotFoundError } from '../../core/errors/rfc9457';

export interface WebhookPayload {
  eventId: string;
  eventType: string;
  timestamp: string;
  data: any;
}

export class IntegrationsService {
  private circuitBreakerState: Map<string, { failures: number; state: 'CLOSED' | 'OPEN'; lastFailure: number }> = new Map();
  private mockOtpStore: Map<string, { otp: string; expiresAt: number }> = new Map();

  // Circuit breaker wrapper
  async executeWithCircuitBreaker<T>(adapterName: string, fn: () => Promise<T>): Promise<T> {
    const cb = this.circuitBreakerState.get(adapterName) || { failures: 0, state: 'CLOSED', lastFailure: 0 };
    
    // Check if open circuit breaker can attempt reset (after 30s)
    if (cb.state === 'OPEN') {
      if (Date.now() - cb.lastFailure > 30000) {
        cb.state = 'CLOSED';
        cb.failures = 0;
      } else {
        throw new Error(`Circuit breaker is OPEN for adapter: ${adapterName}`);
      }
    }

    try {
      const result = await fn();
      cb.failures = 0;
      this.circuitBreakerState.set(adapterName, cb);
      return result;
    } catch (err) {
      cb.failures++;
      cb.lastFailure = Date.now();
      if (cb.failures >= 5) {
        cb.state = 'OPEN';
      }
      this.circuitBreakerState.set(adapterName, cb);
      throw err;
    }
  }

  // Inbound HMAC Webhook verification (with replay protection)
  verifyInboundWebhook(rawBody: string, signature: string, timestamp: string, secret = 'mock-webhook-secret-key'): boolean {
    // 1. Replay window check: reject if > 5 minutes old
    const reqTime = parseInt(timestamp, 10);
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - reqTime) > 300) {
      throw new UnauthorizedError('Webhook timestamp out of allowed 5-minute replay window');
    }

    // 2. Compute expected HMAC
    const expected = cryptoService.hmacHash(`${timestamp}.${rawBody}`);
    if (expected !== signature) {
      throw new UnauthorizedError('Invalid webhook HMAC signature');
    }

    return true;
  }

  // Handle Civil Registration Webhook (Zero-touch Life Events)
  async handleCivilRegistrationWebhook(payload: WebhookPayload) {
    const { eventType, data } = payload;

    if (eventType === 'CIVIL_REG.BIRTH') {
      // Automatic birth registration
      const person = await recordsService.createPerson({
        first_name: data.first_name,
        last_name: data.last_name,
        date_of_birth: data.date_of_birth,
        gender: data.gender,
        phone: data.parent_phone || '9876543210',
        address_line: data.address_line,
        district: data.district,
        state: data.state || 'Delhi',
        pincode: data.pincode || '110001',
      });

      // Link to parent household if provided
      if (data.parent_household_uid) {
        db.insert('household_memberships', {
          household_uid: data.parent_household_uid,
          person_uid: person.person_uid,
          role_in_household: 'CHILD',
        });
      }

      await recordsService.executeLifeEvent({
        event_type: 'BIRTH',
        person_uid: person.person_uid,
        effective_date: data.date_of_birth,
        payload: { hospital: data.hospital, regNumber: data.reg_number },
        source_integration: 'CIVIL_REGISTRATION_CRS',
      });

      return { processed: true, personUid: person.person_uid, event: 'BIRTH' };
    }

    if (eventType === 'CIVIL_REG.DEATH') {
      // Automatic death registration
      await recordsService.executeLifeEvent({
        event_type: 'DEATH',
        person_uid: data.person_uid,
        effective_date: data.death_date,
        payload: { cause: data.cause, deathCertificateNo: data.certificate_no },
        source_integration: 'CIVIL_REGISTRATION_CRS',
      });

      return { processed: true, personUid: data.person_uid, event: 'DEATH' };
    }

    return { processed: false, reason: 'Unsupported event type' };
  }

  // Mock Notifications (SMS & WhatsApp EN + HI)
  sendNotification(params: {
    recipientPersonUid: string;
    channel: 'SMS' | 'WHATSAPP';
    templateKey: string;
    lang: 'EN' | 'HI';
    variables: Record<string, string>;
  }) {
    let body = '';
    if (params.lang === 'HI') {
      if (params.templateKey === 'APPLICATION_STATUS_UPDATE') {
        body = `Hello ${params.variables.name || ''}, your application ${params.variables.appNumber} status is now '${params.variables.status}'. Details: ${params.variables.note || ''}`;
      } else if (params.templateKey === 'DISBURSEMENT_SUCCESS') {
        body = `Congratulations! ₹${params.variables.amount} has been transferred to your account under ${params.variables.schemeName}. Ref: ${params.variables.txRef}`;
      } else {
        body = `Notice: Your application ${params.variables.appNumber} has been updated.`;
      }
    } else {
      if (params.templateKey === 'APPLICATION_STATUS_UPDATE') {
        body = `Dear ${params.variables.name || 'Citizen'}, your application ${params.variables.appNumber} status is now '${params.variables.status}'. Details: ${params.variables.note || ''}`;
      } else if (params.templateKey === 'DISBURSEMENT_SUCCESS') {
        body = `Congratulations! Benefit amount of ₹${params.variables.amount} has been disbursed for ${params.variables.schemeName}. Ref: ${params.variables.txRef}`;
      } else {
        body = `Notification regarding your application ${params.variables.appNumber}.`;
      }
    }

    const notif = db.insert('notifications', {
      recipient_person_uid: params.recipientPersonUid,
      channel: params.channel,
      template_key: params.templateKey,
      lang: params.lang,
      message_body: body,
      status: 'SENT',
      provider_ref: `MOCK-${params.channel}-${Date.now()}`,
      sent_at: new Date().toISOString(),
    });

    return notif;
  }

  // IVR Webhook (Keypad/Missed-call input -> Speech-ready payload)
  handleIvrWebhook(params: { callerPhone: string; digitsEntered?: string; callType: 'INBOUND_CALL' | 'MISSED_CALL' }) {
    const appNumber = params.digitsEntered ? `APP-${params.digitsEntered}` : null;
    let statusTextEn = 'Welcome to the Public Welfare Portal IVR.';
    let statusTextHi = 'Welcome to the Ojas Public Welfare automated phone service.';

    if (params.digitsEntered) {
      const apps = db.getTable('applications');
      const app = apps.find((a) => a.application_number.includes(params.digitsEntered!));

      if (app) {
        statusTextEn = `Your application for ${app.grant_unit} grant is currently ${app.status}.`;
        statusTextHi = `Your application status is currently ${app.status}.`;
      } else {
        statusTextEn = 'No active application found matching the digits entered. Please verify your reference number.';
        statusTextHi = 'No application matched the entered reference number. Please check and try again.';
      }
    }

    return {
      callerPhone: params.callerPhone,
      speechPayloadEn: statusTextEn,
      speechPayloadHi: statusTextHi,
      audioUrl: `https://mock-ivr.internal/tts?lang=hi&text=${encodeURIComponent(statusTextHi)}`,
    };
  }

  // OTP-based status lookup for citizens without accounts
  requestStatusOtp(applicationNumber: string, phone: string) {
    const apps = db.getTable('applications');
    const app = apps.find((a) => a.application_number === applicationNumber);
    if (!app) throw new NotFoundError('Application number not found');

    const mockOtp = '123456'; // Deterministic test OTP for demo
    this.mockOtpStore.set(applicationNumber, {
      otp: mockOtp,
      expiresAt: Date.now() + 10 * 60 * 1000,
    });

    return {
      success: true,
      message: `OTP sent to registered mobile ending with ${phone.slice(-4)}. For demo: use OTP 123456`,
    };
  }

  verifyStatusOtpAndGetTracking(applicationNumber: string, otp: string) {
    const stored = this.mockOtpStore.get(applicationNumber);
    if (!stored || stored.otp !== otp || Date.now() > stored.expiresAt) {
      throw new ValidationError('Invalid or expired OTP');
    }

    return applicationsWorkflowService.getApplicationTracking(applicationNumber);
  }
}

export const integrationsService = new IntegrationsService();
