import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Local API proxy so the SPA can call /api/v1 without CORS friction in dev
    proxy: { '/api': 'http://localhost:3001' },
  },
});
