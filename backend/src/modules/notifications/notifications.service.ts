import { db } from '../../core/database/db';

export type NotificationTemplate =
  | 'APPLICATION_SUBMITTED'
  | 'APPLICATION_FLAGGED'
  | 'APPLICATION_APPROVED'
  | 'APPLICATION_REJECTED'
  | 'DISBURSEMENT_SUCCESS'
  | 'DOCUMENT_REQUESTED'
  | 'APPEAL_FILED';

const TEMPLATES: Record<NotificationTemplate, { EN: (v: Record<string, string>) => string; HI: (v: Record<string, string>) => string }> = {
  APPLICATION_SUBMITTED: {
    EN: (v) => `Your application ${v.appNumber} for ${v.scheme} has been received and is under verification.`,
    HI: (v) => `Your application ${v.appNumber} (${v.scheme}) has been received and is under verification.`,
  },
  APPLICATION_FLAGGED: {
    EN: (v) => `Your application ${v.appNumber} needs an officer's review: ${v.reason}. No action has been taken against you yet.`,
    HI: (v) => `Your application ${v.appNumber} is scheduled for officer review: ${v.reason}. No decision taken yet.`,
  },
  APPLICATION_APPROVED: {
    EN: (v) => `Good news! Your application ${v.appNumber} for ${v.scheme} has been approved.`,
    HI: (v) => `Good news! Your application ${v.appNumber} (${v.scheme}) has been approved.`,
  },
  APPLICATION_REJECTED: {
    EN: (v) => `Your application ${v.appNumber} was not approved. Reason: ${v.reason}. You can file an appeal from your dashboard.`,
    HI: (v) => `Your application ${v.appNumber} was not approved. Reason: ${v.reason}. You can appeal from the dashboard.`,
  },
  DISBURSEMENT_SUCCESS: {
    EN: (v) => `Rs ${v.amount} has been transferred to your bank account for ${v.scheme}. Ref: ${v.txRef}`,
    HI: (v) => `₹${v.amount} has been disbursed to your bank account under ${v.scheme}. Reference: ${v.txRef}`,
  },
  DOCUMENT_REQUESTED: {
    EN: (v) => `Please upload ${v.docType} for application ${v.appNumber}.`,
    HI: (v) => `Please upload ${v.docType} for application ${v.appNumber}.`,
  },
  APPEAL_FILED: {
    EN: (v) => `Your appeal for application ${v.appNumber} has been registered. A different officer will review it.`,
    HI: (v) => `Your appeal for application ${v.appNumber} has been logged for independent officer review.`,
  },
};

export class NotificationsService {
  /** Sends a mock SMS and WhatsApp message in both EN and HI. No real gateway is contacted. */
  notify(personUid: string, template: NotificationTemplate, vars: Record<string, string>) {
    const t = TEMPLATES[template];
    const created: any[] = [];
    for (const channel of ['SMS', 'WHATSAPP'] as const) {
      for (const lang of ['EN', 'HI'] as const) {
        created.push(
          db.insert('notifications', {
            recipient_person_uid: personUid,
            channel,
            template_key: template,
            lang,
            message_body: t[lang](vars),
            status: 'SENT',
            provider_ref: `MOCK-${channel}-${Date.now().toString(36).toUpperCase()}`,
            sent_at: new Date().toISOString(),
          })
        );
      }
    }
    return created;
  }

  listFor(personUid: string) {
    return db
      .getTable('notifications')
      .filter((n) => n.recipient_person_uid === personUid)
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  }
}

export const notificationsService = new NotificationsService();
