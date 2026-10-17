import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: {
    port: 5107,
    proxy: {
      // Mismo origen en desarrollo, como en el VPS: así el chat no necesita
      // CORS y el stream no pasa por una capa más.
      '/api': { target: 'http://localhost:3107', changeOrigin: true },
      '/health': { target: 'http://localhost:3107', changeOrigin: true },
    },
  },
})
