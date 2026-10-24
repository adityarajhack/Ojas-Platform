import crypto from 'crypto';
import { cryptoService } from '../crypto/envelope';

export interface StoredDocument {
  storageKey: string;
  checksumSha256: string;
  fileSizeBytes: number;
  mimeType: string;
  ivHex: string;
  isEncrypted: boolean;
  malwareClean: boolean;
  signedUrl: string;
  expiresAt: string;
}

export class StorageService {
  private inMemoryStorage: Map<string, { buffer: Buffer; metadata: any }> = new Map();

  async uploadDocument(
    personUid: string,
    docType: string,
    filename: string,
    mimeType: string,
    data: Buffer
  ): Promise<StoredDocument> {
    // 1. Calculate plain checksum
    const checksumSha256 = cryptoService.sha256(data);

    // 2. Malware scan hook (clean by default; can flag signature 'EICAR')
    const isEicar = data.toString('utf8').includes('X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR');
    const malwareClean = !isEicar;

    // 3. Encrypt file with AES-256-GCM
    const iv = crypto.randomBytes(12);
    const key = Buffer.from('0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef', 'hex');
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
    const authTag = cipher.getAuthTag();
    const finalPayload = Buffer.concat([authTag, encrypted]);

    // 4. Save to storage
    const storageKey = `docs/${personUid}/${docType}/${Date.now()}_${filename}`;
    this.inMemoryStorage.set(storageKey, {
      buffer: finalPayload,
      metadata: {
        filename,
        mimeType,
        checksumSha256,
        ivHex: iv.toString('hex'),
        malwareClean,
      },
    });

    const expiresAt = new Date(Date.now() + 3600 * 1000).toISOString();
    const signedUrl = this.generateSignedUrl(storageKey, 3600);

    return {
      storageKey,
      checksumSha256,
      fileSizeBytes: data.length,
      mimeType,
      ivHex: iv.toString('hex'),
      isEncrypted: true,
      malwareClean,
      signedUrl,
      expiresAt,
    };
  }

  async getDocument(storageKey: string): Promise<{ data: Buffer; metadata: any }> {
    const item = this.inMemoryStorage.get(storageKey);
    if (!item) {
      throw new Error(`File not found at storage key: ${storageKey}`);
    }

    // Decrypt on download
    const authTag = item.buffer.subarray(0, 16);
    const ciphertext = item.buffer.subarray(16);
    const iv = Buffer.from(item.metadata.ivHex, 'hex');
    const key = Buffer.from('0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef', 'hex');

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

    return {
      data: decrypted,
      metadata: item.metadata,
    };
  }

  generateSignedUrl(storageKey: string, ttlSeconds = 3600): string {
    const expires = Math.floor(Date.now() / 1000) + ttlSeconds;
    const signature = cryptoService.hmacHash(`${storageKey}:${expires}`);
    return `/v1/documents/download?key=${encodeURIComponent(storageKey)}&expires=${expires}&sig=${signature}`;
  }

  verifySignedUrl(storageKey: string, expires: number, sig: string): boolean {
    if (Math.floor(Date.now() / 1000) > expires) return false;
    const expected = cryptoService.hmacHash(`${storageKey}:${expires}`);
    return expected === sig;
  }
}

export const storageService = new StorageService();
