import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    include: ['src/**/__tests__/**/*.test.ts'],
    environment: 'node',
  },
  resolve: {
    alias: {
      // Read shared source directly so tests don't need a prior `pnpm build`.
      '@maps-viewer/shared': resolve(here, '../shared/src/index.ts'),
    },
  },
});
