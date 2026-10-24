import { EventEmitter } from 'events';
import { db } from '../database/db';
import { activeQueueJobsGauge } from '../telemetry/metrics';

export interface QueueJob<T = any> {
  id: string;
  name: string;
  data: T;
  delayMs?: number;
  attempts?: number;
}

export class QueueService extends EventEmitter {
  private inMemoryQueue: QueueJob[] = [];
  private idempotencyStore: Map<string, { result: any; expiresAt: number }> = new Map();
  private isProcessing = false;

  constructor() {
    super();
    this.startWorker();
  }

  // Idempotency key check & store
  checkIdempotency(key: string): any | null {
    const item = this.idempotencyStore.get(key);
    if (!item) return null;
    if (Date.now() > item.expiresAt) {
      this.idempotencyStore.delete(key);
      return null;
    }
    return item.result;
  }

  setIdempotency(key: string, result: any, ttlSeconds = 86400) {
    this.idempotencyStore.set(key, {
      result,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }

  async addJob<T>(name: string, data: T, delayMs = 0): Promise<string> {
    const id = crypto.randomUUID();
    const job: QueueJob<T> = {
      id,
      name,
      data,
      delayMs,
      attempts: 0,
    };
    
    if (delayMs > 0) {
      setTimeout(() => {
        this.inMemoryQueue.push(job);
        activeQueueJobsGauge.set({ queue_name: name }, this.inMemoryQueue.length);
        this.emit('jobAdded', job);
      }, delayMs);
    } else {
      this.inMemoryQueue.push(job);
      activeQueueJobsGauge.set({ queue_name: name }, this.inMemoryQueue.length);
      this.emit('jobAdded', job);
    }

    return id;
  }

  private startWorker() {
    setInterval(async () => {
      if (this.isProcessing || this.inMemoryQueue.length === 0) return;
      this.isProcessing = true;
      const job = this.inMemoryQueue.shift();
      if (job) {
        try {
          activeQueueJobsGauge.set({ queue_name: job.name }, this.inMemoryQueue.length);
          this.emit(`process:${job.name}`, job.data);
        } catch (err: any) {
          console.error(`Error processing job ${job.name}:`, err);
        }
      }
      this.isProcessing = false;
    }, 100);
  }

  // Outbox delivery worker: publishes pending events
  async processOutboxBatch(): Promise<number> {
    const outboxTable = db.getTable('outbox');
    const pending = outboxTable.filter((e) => e.status === 'PENDING');
    let processed = 0;
    for (const event of pending) {
      try {
        this.emit(event.event_type, event.payload);
        event.status = 'PUBLISHED';
        event.processed_at = new Date().toISOString();
        processed++;
      } catch (err: any) {
        event.retry_count = (event.retry_count || 0) + 1;
        if (event.retry_count > 5) {
          event.status = 'FAILED';
        }
      }
    }
    return processed;
  }
}

export const queueService = new QueueService();
