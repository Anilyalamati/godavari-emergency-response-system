import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const environment = loadEnv(mode, process.cwd(), '');
  const publicEnvironment = loadEnv(mode, process.cwd(), 'VITE_PUBLIC_');
  const apiTarget = environment.API_PROXY_TARGET || 'http://127.0.0.1:4000';
  const apiBaseUrl = publicEnvironment.VITE_PUBLIC_API_BASE_URL || '/api';
  const safeApiBaseUrl = /^\/(?!\/)[A-Za-z0-9/_-]*$/.test(apiBaseUrl) ? apiBaseUrl : '/api';

  return {
    plugins: [react(), tailwindcss()],
    // Browser env values are an explicit allowlist below, never a prefix-wide dump.
    envPrefix: [],
    define: {
      'import.meta.env.VITE_PUBLIC_API_BASE_URL': JSON.stringify(safeApiBaseUrl),
      'import.meta.env.VITE_PUBLIC_SUPABASE_URL': JSON.stringify(
        publicEnvironment.VITE_PUBLIC_SUPABASE_URL || '',
      ),
      'import.meta.env.VITE_PUBLIC_SUPABASE_PUBLISHABLE_KEY': JSON.stringify(
        publicEnvironment.VITE_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '',
      ),
    },
    server: {
      host: '0.0.0.0',
      port: 3000,
      strictPort: true,
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: true,
        },
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('/node_modules/@supabase/')) return 'supabase-auth';
          },
        },
      },
    },
  };
});
