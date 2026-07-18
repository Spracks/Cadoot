import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Import the shared package straight from source so there is no separate build
// step, and Vite transpiles its TypeScript along with the client.
const sharedEntry = path.resolve(
  fileURLToPath(new URL('../shared/src/index.ts', import.meta.url)),
);

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@cadoot/shared': sharedEntry },
  },
  server: {
    port: 5173,
    // In dev the client runs on :5173 and proxies Socket.IO to the server on
    // :3000, so client code can connect same-origin in both dev and prod.
    proxy: {
      '/socket.io': { target: 'http://localhost:3000', ws: true },
      '/api': { target: 'http://localhost:3000' },
    },
  },
});
