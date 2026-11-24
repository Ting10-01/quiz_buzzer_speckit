import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  // Same-origin in development: the teacher API and Socket.IO run on the server (002 research RD-06).
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:3000',
      '/socket.io': { target: 'http://127.0.0.1:3000', ws: true },
    },
  },
  test: {
    environment: 'jsdom',
    include: ['tests/unit/**/*.test.ts', 'tests/component/**/*.test.tsx'],
    setupFiles: ['tests/setup.ts'],
  },
});
