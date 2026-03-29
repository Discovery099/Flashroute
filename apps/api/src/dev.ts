import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const envPath = join(__dirname, '../../../.env');
try {
  const envContent = readFileSync(envPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx < 0) continue;
    const key = trimmed.slice(0, eqIdx);
    const value = trimmed.slice(eqIdx + 1);
    if (!process.env[key]) process.env[key] = value;
  }
} catch (e) {
  console.error('Failed to load .env:', String(e));
}

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379/0';
const PORT = process.env.PORT ?? '3001';

console.log('Importing runtime...');
const mod = await import('./runtime.js');
console.log('Runtime imported, creating app...');

const app = await mod.createApiRuntime({
  redisUrl: REDIS_URL,
  redisKeyPrefix: 'fr:',
  redisQueuePrefix: 'fr:queue:',
  auth: {
    jwtSecret: process.env.JWT_ACCESS_SECRET ?? 'dev-secret-64-chars-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
    accessTokenTtlSeconds: 900,
    refreshTokenTtlSeconds: 604800,
    bcryptRounds: 12,
    refreshTokenPepper: process.env.JWT_REFRESH_SECRET ?? 'dev-refresh-pepper-64-xxxxxxxxxxxxxxxxxxxxxxxx',
    apiKeyPepper: process.env.ENCRYPTION_KEY ?? 'dev-apikey-pepper-32-xxxxxxxx',
  },
  frontendUrl: process.env.FRONTEND_URL ?? 'http://localhost:5173',
});

console.log('App created, starting server on', PORT);
await app.listen({ port: parseInt(PORT), host: '0.0.0.0' });
console.log(`API listening on http://0.0.0.0:${PORT}`);