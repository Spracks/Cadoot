import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const sharedEntry = path.resolve(
  fileURLToPath(new URL('./shared/src/index.ts', import.meta.url)),
);

export default defineConfig({
  resolve: {
    alias: { '@cadoot/shared': sharedEntry },
  },
  test: {
    include: ['**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    environment: 'node',
  },
});
