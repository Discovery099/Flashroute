import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@flashroute/blockchain': resolve(__dirname, '../../packages/blockchain/src/index.ts'),
      '@flashroute/shared': resolve(__dirname, '../../packages/shared/src/index.ts'),
    },
  },
  test: {
    environment: 'node',
  },
});
