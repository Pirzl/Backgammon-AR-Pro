/// <reference types="vitest" />
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react-swc'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: false,
  },
  build: {
    outDir: 'dist',
    assetsDir: '',
    rollupOptions: {
      output: {
        entryFileNames: `[name].js`,
        chunkFileNames: `[name].js`,
        assetFileNames: `[name].[ext]`,
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('react') || id.includes('react-dom')) return 'vendor-react';
            if (id.includes('framer-motion') || id.includes('lucide-react')) return 'vendor-ui';
            if (id.includes('@supabase')) return 'vendor-utils';
          }
          if (id.includes('/src/features/hand-tracking/')) return 'feature-hand-tracking';
          if (id.includes('/src/features/ai-worker/')) return 'feature-ai-engine';
          if (id.includes('/src/entities/game/')) return 'feature-game-core';
        },
      },
    },
    chunkSizeWarningLimit: 1200,
  },
  worker: {
    format: 'iife', // Classic worker compatibility (importScripts)
    plugins: () => [react()],
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
  },
})
