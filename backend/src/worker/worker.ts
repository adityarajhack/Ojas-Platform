import { queueService } from '../core/queue/queue';
import { db } from '../core/database/db';
import { auditTrustService } from '../modules/audit-trust/audit.service';
import { slaBreachesCounter } from '../core/telemetry/metrics';

export class BackgroundWorker {
  private timer: NodeJS.Timeout | null = null;
  private isRunning = false;

  async start() {
    await db.connect();
    this.startLoops();
  }

  /** Starts outbox, SLA and Merkle checkpoint loops. Called in-process by the API when running without Postgres/Redis. */
  startLoops() {
    if (this.isRunning) return;
    this.isRunning = true;
    console.log('Gov Platform Background Worker initialized.');

    // Outbox & SLA job loop every 2 seconds
    this.timer = setInterval(async () => {
      await this.processOutbox();
      await this.processSlaTimers();
    }, 2000);

    // Periodic Merkle Checkpoint every 60 seconds
    setInterval(() => {
      try {
        const cp = auditTrustService.createMerkleCheckpoint();
        console.log(`[Worker] Created signed Merkle checkpoint Epoch #${cp.epoch}: ${cp.root_hash}`);
      } catch (err: any) {
        console.error('[Worker] Error creating Merkle checkpoint:', err.message);
      }
    }, 60000);
  }

  private async processOutbox() {
    try {
      const processed = await queueService.processOutboxBatch();
      if (processed > 0) {
        console.log(`[Worker] Delivered ${processed} outbox events.`);
      }
    } catch (err: any) {
      console.error('[Worker] Outbox processing error:', err.message);
    }
  }

  private async processSlaTimers() {
    try {
      const timers = db.getTable('sla_timers');
      const now = new Date();
      const expiredTimers = timers.filter((t) => !t.escalated && new Date(t.deadline_at) < now);

      for (const timer of expiredTimers) {
        timer.escalated = true;
        timer.escalated_at = now.toISOString();

        // Assign to Senior Officer
        const users = db.getTable('users');
        const seniorOfficer = users.find((u) => u.role === 'SENIOR_OFFICER');
        if (seniorOfficer) {
          timer.escalated_to_user_id = seniorOfficer.id;
        }

        slaBreachesCounter.inc({ stage: timer.stage, district: 'CENTRAL' });

        db.insert('application_events', {
          application_id: timer.application_id,
          from_status: timer.stage,
          to_status: timer.stage,
          actor_user_id: null,
          reason: 'SLA_BREACH_AUTO_ESCALATION',
          note_en: 'SLA window exceeded. Automatically escalated to Senior Officer queue.',
          note_hi: 'SLA deadline expired. Automatically escalated to Senior Officer queue.',
        });

        console.log(`[Worker] Application ${timer.application_id} SLA breached -> Auto-escalated to Senior Officer.`);
      }
    } catch (err: any) {
      console.error('[Worker] SLA timer error:', err.message);
    }
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.isRunning = false;
  }
}

export const worker = new BackgroundWorker();

if (require.main === module) {
  worker.start();
}
