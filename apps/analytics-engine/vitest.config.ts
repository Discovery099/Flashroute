import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@flashroute/shared/constants': resolve(__dirname, '../../packages/shared/src/constants.ts'),
      '@flashroute/shared': resolve(__dirname, '../../packages/shared/src/index.ts'),
    },
  },
  test: {
    environment: 'node',
  },
});
