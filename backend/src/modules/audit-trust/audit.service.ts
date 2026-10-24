import { db } from '../../core/database/db';
import { cryptoService } from '../../core/crypto/envelope';

export interface AuditRecord {
  id: string;
  sequence_number: number;
  timestamp: string;
  actor_id: string;
  actor_role: string;
  action: string;
  entity_type: string;
  entity_id: string;
  prev_hash: string;
  current_hash: string;
  client_ip?: string;
  user_agent?: string;
  details: Record<string, any>;
}

export interface MerkleCheckpoint {
  id: string;
  epoch: number;
  root_hash: string;
  start_sequence: number;
  end_sequence: number;
  signature_ed25519: string;
  public_key_pem: string;
  checkpoint_timestamp: string;
}

export class AuditTrustService {
  private keyPair: { publicKeyPem: string; privateKeyPem: string };

  constructor() {
    this.keyPair = cryptoService.generateSigningKeyPair();
  }

  // Hash-chained audit log entry
  appendAuditLog(entry: {
    actor_id: string;
    actor_role: string;
    action: string;
    entity_type: string;
    entity_id: string;
    client_ip?: string;
    user_agent?: string;
    details?: Record<string, any>;
  }): AuditRecord {
    const table = db.getTable('audit_log');
    const sequence_number = table.length + 1;
    const prev_hash = sequence_number === 1 ? '0'.repeat(64) : table[table.length - 1].current_hash;
    const timestamp = new Date().toISOString();
    
    // Deterministic payload hash
    const rawData = `${prev_hash}:${sequence_number}:${timestamp}:${entry.actor_id}:${entry.actor_role}:${entry.action}:${entry.entity_type}:${entry.entity_id}:${JSON.stringify(entry.details || {})}`;
    const current_hash = cryptoService.sha256(rawData);

    const record: AuditRecord = {
      id: crypto.randomUUID(),
      sequence_number,
      timestamp,
      actor_id: entry.actor_id,
      actor_role: entry.actor_role,
      action: entry.action,
      entity_type: entry.entity_type,
      entity_id: entry.entity_id,
      prev_hash,
      current_hash,
      client_ip: entry.client_ip || '127.0.0.1',
      user_agent: entry.user_agent || 'gov-client',
      details: entry.details || {},
    };

    table.push(record);
    return record;
  }

  // Audit chain verification: detects any tampering or broken link
  verifyAuditChain(): { valid: boolean; totalEntries: number; brokenSequence?: number; reason?: string } {
    const table = db.getTable('audit_log');
    if (table.length === 0) {
      return { valid: true, totalEntries: 0 };
    }

    let prevHash = '0'.repeat(64);
    for (let i = 0; i < table.length; i++) {
      const record = table[i];
      if (record.prev_hash !== prevHash) {
        return {
          valid: false,
          totalEntries: table.length,
          brokenSequence: record.sequence_number,
          reason: `Previous hash mismatch at sequence ${record.sequence_number}: expected ${prevHash}, got ${record.prev_hash}`,
        };
      }

      const rawData = `${record.prev_hash}:${record.sequence_number}:${record.timestamp}:${record.actor_id}:${record.actor_role}:${record.action}:${record.entity_type}:${record.entity_id}:${JSON.stringify(record.details || {})}`;
      const computedHash = cryptoService.sha256(rawData);
      if (computedHash !== record.current_hash) {
        return {
          valid: false,
          totalEntries: table.length,
          brokenSequence: record.sequence_number,
          reason: `Payload tamper detected at sequence ${record.sequence_number}: computed ${computedHash}, stored ${record.current_hash}`,
        };
      }
      prevHash = record.current_hash;
    }

    return { valid: true, totalEntries: table.length };
  }

  // Merkle tree root & inclusion proof
  createMerkleCheckpoint(): MerkleCheckpoint {
    const table = db.getTable('audit_log');
    const checkpoints = db.getTable('audit_checkpoints');
    const epoch = checkpoints.length + 1;
    
    const hashes = table.map((r) => r.current_hash);
    const root_hash = this.buildMerkleRoot(hashes);
    const signature = cryptoService.signData(root_hash, this.keyPair.privateKeyPem);

    const checkpoint: MerkleCheckpoint = {
      id: crypto.randomUUID(),
      epoch,
      root_hash,
      start_sequence: 1,
      end_sequence: table.length,
      signature_ed25519: signature,
      public_key_pem: this.keyPair.publicKeyPem,
      checkpoint_timestamp: new Date().toISOString(),
    };

    checkpoints.push(checkpoint);
    return checkpoint;
  }

  private buildMerkleRoot(leaves: string[]): string {
    if (leaves.length === 0) return cryptoService.sha256('EMPTY');
    let currentLevel = [...leaves];
    while (currentLevel.length > 1) {
      const nextLevel: string[] = [];
      for (let i = 0; i < currentLevel.length; i += 2) {
        const left = currentLevel[i];
        const right = i + 1 < currentLevel.length ? currentLevel[i + 1] : left;
        nextLevel.push(cryptoService.sha256(left + right));
      }
      currentLevel = nextLevel;
    }
    return currentLevel[0];
  }

  // Get inclusion proof for an audit log record
  getInclusionProof(sequence: number): { sequence: number; hash: string; root: string; proof: string[] } | null {
    const table = db.getTable('audit_log');
    const idx = table.findIndex((r) => r.sequence_number === sequence);
    if (idx === -1) return null;

    const hashes = table.map((r) => r.current_hash);
    const targetHash = hashes[idx];
    const proof: string[] = [];

    let currentLevel = [...hashes];
    let index = idx;

    while (currentLevel.length > 1) {
      const isRight = index % 2 === 1;
      const pairIndex = isRight ? index - 1 : index + 1;
      if (pairIndex < currentLevel.length) {
        proof.push(currentLevel[pairIndex]);
      } else {
        proof.push(currentLevel[index]);
      }
      
      const nextLevel: string[] = [];
      for (let i = 0; i < currentLevel.length; i += 2) {
        const left = currentLevel[i];
        const right = i + 1 < currentLevel.length ? currentLevel[i + 1] : left;
        nextLevel.push(cryptoService.sha256(left + right));
      }
      currentLevel = nextLevel;
      index = Math.floor(index / 2);
    }

    return {
      sequence,
      hash: targetHash,
      root: currentLevel[0],
      proof,
    };
  }

  // Access Log (Citizens tracking "Who accessed my data")
  logAccess(entry: {
    person_uid: string;
    accessor_user_id: string;
    accessor_role: string;
    purpose: string;
    department_id?: string;
    accessed_fields: string[];
    is_break_glass?: boolean;
    break_glass_reason?: string;
  }) {
    const table = db.getTable('access_log');
    table.push({
      id: crypto.randomUUID(),
      person_uid: entry.person_uid,
      accessor_user_id: entry.accessor_user_id,
      accessor_role: entry.accessor_role,
      purpose: entry.purpose,
      department_id: entry.department_id || 'GENERAL',
      accessed_fields: entry.accessed_fields,
      accessed_at: new Date().toISOString(),
      is_break_glass: entry.is_break_glass || false,
      break_glass_reason: entry.break_glass_reason || null,
    });
  }

  getAccessHistory(personUid: string) {
    const table = db.getTable('access_log');
    return table.filter((r) => r.person_uid === personUid);
  }
}

export const auditTrustService = new AuditTrustService();
