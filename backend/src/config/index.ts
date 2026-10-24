import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  host: process.env.HOST || '0.0.0.0',
  databaseUrl: process.env.DATABASE_URL || 'postgres://gov_admin:gov_secure_password_2026@localhost:5432/gov_unified',
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  jwt: {
    secret: process.env.JWT_SECRET || 'super-secret-gov-jwt-access-token-key-32chars',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'super-secret-gov-jwt-refresh-token-key-32chars',
    accessExpiry: '15m',
    refreshExpiry: '7d',
  },
  encryption: {
    masterKey: process.env.ENCRYPTION_MASTER_KEY || '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    hmacSecret: process.env.HMAC_SECRET || 'gov-cross-department-hmac-secret-key-32chars',
  },
  storage: {
    endpoint: process.env.STORAGE_ENDPOINT || 'http://localhost:9000',
    accessKey: process.env.STORAGE_ACCESS_KEY || 'minioadmin',
    secretKey: process.env.STORAGE_SECRET_KEY || 'minioadminpassword',
    bucket: process.env.STORAGE_BUCKET || 'gov-documents',
  },
  ai: {
    enabled: process.env.AI_FEATURE_ENABLED === 'true',
    apiKey: process.env.AI_API_KEY || '',
  },
};
