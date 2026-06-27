import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Asistencia',
        short_name: 'Asistencia',
        description: 'Marcación de entrada y salida',
        theme_color: '#0A1A0F',
        background_color: '#0A1A0F',
        display: 'standalone',
        start_url: '/',
      },
    }),
  ],
  server: {
    port: Number(process.env.PORT) || 5173,
    // En dev, /api se enruta al backend. En prod se usa VITE_API_URL.
    proxy: {
      '/api': { target: process.env.VITE_API_URL ?? 'http://localhost:8080', changeOrigin: true },
    },
  },
});
