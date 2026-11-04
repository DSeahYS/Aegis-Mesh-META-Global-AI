import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    watch: {
      ignored: ['**/backend/**', '**/public/**'],
    },
    proxy: {
      '/api': {
        // Node env without @types/node: read via globalThis (Docker Compose sets this).
        target:
          (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process?.env
            ?.VITE_PROXY_TARGET ?? 'http://localhost:8000',
        changeOrigin: true,
        secure: false,
      },
    },
  },
})
