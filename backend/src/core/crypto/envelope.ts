import crypto from 'crypto';
import { authenticator } from 'otplib';

export interface EncryptedPayload {
  ciphertext: string;
  iv: string;
  authTag: string;
}

const ALGORITHM = 'aes-256-gcm';

export class EnvelopeEncryptionService {
  private masterKey: Buffer;
  private hmacSecret: string;

  constructor(masterKeyHex?: string, hmacSecret?: string) {
    const hex = masterKeyHex || '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    this.masterKey = Buffer.from(hex, 'hex');
    this.hmacSecret = hmacSecret || 'gov-cross-department-hmac-secret-key-32chars';
  }

  encrypt(plaintext: string): EncryptedPayload {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(ALGORITHM, this.masterKey, iv);
    let ciphertext = cipher.update(plaintext, 'utf8', 'hex');
    ciphertext += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    return {
      ciphertext,
      iv: iv.toString('hex'),
      authTag,
    };
  }

  decrypt(payload: EncryptedPayload): string {
    const decipher = crypto.createDecipheriv(
      ALGORITHM,
      this.masterKey,
      Buffer.from(payload.iv, 'hex')
    );
    decipher.setAuthTag(Buffer.from(payload.authTag, 'hex'));
    let decrypted = decipher.update(payload.ciphertext, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  // HMAC for blind privacy-preserving queries across departments
  hmacHash(value: string): string {
    const normalized = value.trim().toUpperCase();
    return crypto.createHmac('sha256', this.hmacSecret).update(normalized).digest('hex');
  }

  // SHA-256 hash
  sha256(value: string | Buffer): string {
    return crypto.createHash('sha256').update(value).digest('hex');
  }

  // Role-based masking
  mask(value: string, type: 'AADHAAR' | 'PHONE' | 'BANK' | 'INCOME'): string {
    if (!value) return '';
    switch (type) {
      case 'AADHAAR':
        return value.replace(/\d(?=\d{4})/g, 'X');
      case 'PHONE':
        return value.replace(/\d(?=\d{4})/g, 'X');
      case 'BANK':
        return value.replace(/.(?=.{4})/g, 'X');
      case 'INCOME':
        return '₹**,***';
      default:
        return '***';
    }
  }

  // Password hashing using Scrypt with salt (Argon2id compatible security profile)
  async hashPassword(password: string): Promise<string> {
    const salt = crypto.randomBytes(16).toString('hex');
    return new Promise((resolve, reject) => {
      crypto.scrypt(password, salt, 64, (err, derivedKey) => {
        if (err) reject(err);
        resolve(`${salt}:${derivedKey.toString('hex')}`);
      });
    });
  }

  async verifyPassword(password: string, combinedHash: string): Promise<boolean> {
    const [salt, key] = combinedHash.split(':');
    if (!salt || !key) return false;
    return new Promise((resolve) => {
      crypto.scrypt(password, salt, 64, (err, derivedKey) => {
        if (err) return resolve(false);
        const match = crypto.timingSafeEqual(Buffer.from(key, 'hex'), derivedKey);
        resolve(match);
      });
    });
  }

  // TOTP 2FA
  generateTotpSecret(): string {
    return authenticator.generateSecret();
  }

  generateTotpUri(user: string, secret: string): string {
    return authenticator.keyuri(user, 'GovUnifiedPortal', secret);
  }

  verifyTotp(token: string, secret: string): boolean {
    return authenticator.verify({ token, secret });
  }

  // Ed25519 Keypair and Signing for Merkle checkpoints & offline QR tokens
  generateSigningKeyPair(): { publicKeyPem: string; privateKeyPem: string } {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
    return {
      publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }) as string,
      privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }) as string,
    };
  }

  signData(data: string, privateKeyPem: string): string {
    const privateKey = crypto.createPrivateKey(privateKeyPem);
    const signature = crypto.sign(null, Buffer.from(data), privateKey);
    return signature.toString('hex');
  }

  verifySignature(data: string, signatureHex: string, publicKeyPem: string): boolean {
    try {
      const publicKey = crypto.createPublicKey(publicKeyPem);
      return crypto.verify(null, Buffer.from(data), publicKey, Buffer.from(signatureHex, 'hex'));
    } catch {
      return false;
    }
  }
}

export const cryptoService = new EnvelopeEncryptionService();
