import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Cambiar `base` al nombre del repo en GitHub antes de deploy
// Ej: si el repo es https://github.com/usuario/montana-dorada → base: '/montana-dorada/'
// Si vas a usar un dominio personalizado o repo tipo <usuario>.github.io → base: '/'
const BASE = process.env.VITE_BASE ?? '/montana-dorada/';

export default defineConfig({
  base: BASE,
  plugins: [react()],
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
