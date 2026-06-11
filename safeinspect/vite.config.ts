import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [
    react(),
  ],

  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },

  server: {
    port: 5173,
    host: true,
  },

  build: {
    target: 'es2020',
    rollupOptions: {
      output: {
        manualChunks: {
          'react-core': ['react', 'react-dom', 'react-router-dom'],
          'supabase':   ['@supabase/supabase-js'],
          'state':      ['zustand'],
          'query':      ['@tanstack/react-query'],
          'pdf':        ['jspdf', 'jspdf-autotable'],
          'forms':      ['react-hook-form', '@hookform/resolvers', 'zod'],
        },
      },
    },
  },
})
