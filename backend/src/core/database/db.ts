import { Pool, PoolClient } from 'pg';
import { config } from '../../config';
import fs from 'fs';
import path from 'path';

export interface DatabaseSessionContext {
  role?: string;
  district?: string;
  userId?: string;
  isBreakGlass?: boolean;
}

export class DatabaseService {
  private pool: Pool | null = null;
  private isConnected = false;
  private inMemoryDb: Map<string, Array<Record<string, any>>> = new Map();

  constructor() {
    this.initTables();
  }

  private initTables() {
    const tables = [
      'departments', 'roles', 'users', 'sessions', 'persons', 'identifiers',
      'properties', 'households', 'household_memberships', 'relationships',
      'income_records', 'life_events', 'family_cards', 'schemes', 'scheme_versions',
      'scheme_bundles', 'applications', 'application_events', 'benefit_ledger',
      'reviews', 'appeals', 'documents', 'document_versions', 'audit_log',
      'audit_checkpoints', 'access_log', 'consents', 'correction_requests',
      'outbox', 'notifications', 'risk_signals', 'entity_clusters', 'simulations',
      'sla_timers', 'case_summaries'
    ];
    for (const t of tables) {
      if (!this.inMemoryDb.has(t)) {
        this.inMemoryDb.set(t, []);
      }
    }
  }

  async connect(): Promise<boolean> {
    try {
      this.pool = new Pool({
        connectionString: config.databaseUrl,
        connectionTimeoutMillis: 1500,
      });
      const client = await this.pool.connect();
      client.release();
      this.isConnected = true;
      console.log('Successfully connected to PostgreSQL');
      await this.runMigrations();
      return true;
    } catch (err: any) {
      console.warn(`PostgreSQL connection failed (${err.message}). Using high-performance in-memory engine.`);
      this.isConnected = false;
      this.pool = null;
      return false;
    }
  }

  async runMigrations() {
    if (!this.pool) return;
    try {
      const sqlPath = path.resolve(__dirname, 'init.sql');
      if (fs.existsSync(sqlPath)) {
        const sql = fs.readFileSync(sqlPath, 'utf8');
        await this.pool.query(sql);
        console.log('PostgreSQL schema applied successfully.');
      }
    } catch (err: any) {
      console.error('Migration error:', err.message);
    }
  }

  async query<T = any>(sql: string, params: any[] = [], ctx?: DatabaseSessionContext): Promise<T[]> {
    if (this.isConnected && this.pool) {
      const client = await this.pool.connect();
      try {
        if (ctx) {
          if (ctx.role) await client.query(`SET LOCAL app.current_user_role = '${ctx.role}'`);
          if (ctx.district) await client.query(`SET LOCAL app.current_user_district = '${ctx.district}'`);
          if (ctx.userId) await client.query(`SET LOCAL app.current_user_id = '${ctx.userId}'`);
        }
        const res = await client.query(sql, params);
        return res.rows as T[];
      } finally {
        client.release();
      }
    }

    // High performance fallback for non-postgres environments
    return this.queryInMemory<T>(sql, params, ctx);
  }

  reset() {
    this.inMemoryDb.clear();
    this.initTables();
  }

  // Memory store accessors
  getTable(tableName: string): Array<Record<string, any>> {
    if (!this.inMemoryDb.has(tableName)) {
      this.inMemoryDb.set(tableName, []);
    }
    return this.inMemoryDb.get(tableName)!;
  }

  insert(tableName: string, record: Record<string, any>): Record<string, any> {
    const table = this.getTable(tableName);
    const newRecord = {
      id: record.id || crypto.randomUUID(),
      created_at: record.created_at || new Date().toISOString(),
      ...record,
    };
    table.push(newRecord);
    return newRecord;
  }

  // Bitemporal update: closes old row and inserts new row
  bitemporalUpdate(
    tableName: string,
    uidKey: string,
    uidValue: string,
    updates: Record<string, any>
  ): Record<string, any> {
    const table = this.getTable(tableName);
    const now = new Date().toISOString();
    
    // Find active current record
    const currentIndex = table.findIndex(
      (r) => r[uidKey] === uidValue && (r.is_current === true || r.is_current === undefined)
    );

    let oldRecord: Record<string, any> = {};
    if (currentIndex !== -1) {
      oldRecord = table[currentIndex];
      // Close old record
      table[currentIndex] = {
        ...oldRecord,
        valid_to: now,
        recorded_to: now,
        is_current: false,
      };
    }

    // Insert new bitemporal record
    const newRecord = {
      ...oldRecord,
      ...updates,
      id: crypto.randomUUID(),
      [uidKey]: uidValue,
      valid_from: now,
      valid_to: '9999-12-31T23:59:59.000Z',
      recorded_from: now,
      recorded_to: '9999-12-31T23:59:59.000Z',
      is_current: true,
      created_at: now,
    };
    table.push(newRecord);
    return newRecord;
  }

  // Hard delete blocker
  delete(tableName: string, _predicate: (r: any) => boolean) {
    if (['persons', 'properties', 'households', 'benefit_ledger', 'audit_log'].includes(tableName)) {
      throw new Error(`Hard deletes forbidden on table ${tableName}. Records must be bitemporally closed.`);
    }
  }

  // Simple query parser for in-memory operations
  private queryInMemory<T>(sql: string, params: any[], ctx?: DatabaseSessionContext): T[] {
    const lower = sql.trim().toLowerCase();
    
    // Hard delete check in raw SQL
    if (lower.startsWith('delete from')) {
      for (const forbidden of ['persons', 'properties', 'households', 'benefit_ledger', 'audit_log']) {
        if (lower.includes(forbidden)) {
          throw new Error(`Hard deletes forbidden on table ${forbidden}. Records must be bitemporally closed.`);
        }
      }
    }

    // Select all / find in memory
    for (const tableName of this.inMemoryDb.keys()) {
      if (lower.includes(`from ${tableName}`)) {
        let rows = [...this.getTable(tableName)];
        
        // Apply RLS if context provided
        if (ctx && ctx.role && !['SYSTEM_ADMIN', 'AUDITOR'].includes(ctx.role) && !ctx.isBreakGlass) {
          if (ctx.district && (tableName === 'persons' || tableName === 'households')) {
            rows = rows.filter((r) => !r.district || r.district === ctx.district);
          }
        }
        return rows as T[];
      }
    }

    return [] as T[];
  }

  async close() {
    if (this.pool) {
      await this.pool.end();
    }
  }
}

export const db = new DatabaseService();
