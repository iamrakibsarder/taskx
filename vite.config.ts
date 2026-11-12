import { defineConfig, loadEnv, type UserConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig(({ mode }) => {
  // In `npm run dev`, API calls go to this dev server (same origin) and are forwarded to
  // VITE_API_URL. No cross-origin requests, so no CORS or browser blocking in development.
  const api = loadEnv(mode, process.cwd(), '').VITE_API_URL?.trim();
  return {
    plugins: [react(), tailwindcss()],
    resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
    server: {
      port: 5173,
      proxy: api ? { '/api': { target: api, changeOrigin: true }, '/health': { target: api, changeOrigin: true } } : undefined,
    },
    test: { environment: 'node', include: ['src/**/*.test.ts'] },
  } as UserConfig & { test: unknown };
});
