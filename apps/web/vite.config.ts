import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // In dev, forward any request starting with /api to the Express server.
    // This avoids CORS issues and lets the frontend call '/api/...' directly.
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
});
