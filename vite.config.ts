import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

/**
 * Contra qué API habla el servidor de desarrollo.
 *
 * Por omisión el backend local. Apuntarlo a producción sirve para probar el
 * frontend contra datos y un canal de verdad sin levantar nada:
 *
 *   VITE_PROXY_TARGET=https://chat.alfredomejia.com.mx bun run dev
 */
const API = process.env.VITE_PROXY_TARGET ?? 'http://localhost:3107'

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
      '/api': { target: API, changeOrigin: true },
      '/health': { target: API, changeOrigin: true },
    },
  },
})
