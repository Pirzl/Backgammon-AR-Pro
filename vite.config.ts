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
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom'],
          'vendor-ui': ['framer-motion', 'lucide-react'],
          'vendor-utils': ['@supabase/supabase-js'],
          // NOTE: @mediapipe/tasks-vision is intentionally excluded.
          // The worker loads vision_bundle.js via importScripts from public/mediapipe/.
          // Including it here causes Rollup to rename the 'exports' shim, breaking the worker.
        },
      },
    },
    chunkSizeWarningLimit: 1000,
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
