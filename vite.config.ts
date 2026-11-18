import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode, command }) => {
  const localWeb = command === 'serve' && mode === 'desktop';
  const api =
    loadEnv(mode, '.', 'VITE_API_BASE_URL').VITE_API_BASE_URL ||
    'https://music-streaming-server-lfon.onrender.com';

  return {
    plugins: [react()],
    define: localWeb ? { 'import.meta.env.VITE_API_BASE_URL': JSON.stringify('/backend') } : {},
    server: {
      host: localWeb ? '127.0.0.1' : 'localhost',
      port: localWeb ? 5180 : 5173,
      strictPort: true,
      proxy: localWeb
        ? {
            '/backend/': {
              target: api,
              changeOrigin: true,
              rewrite: (path) => path.slice('/backend'.length),
              configure(proxy) {
                // Browsers call the local dev server on the same origin.
                proxy.on('proxyReq', (request) => request.removeHeader('origin'));
              },
            },
          }
        : undefined,
    },
    build: { outDir: 'dist', sourcemap: false },
  };
});
