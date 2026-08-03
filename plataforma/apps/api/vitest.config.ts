import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // PGlite en memoria para los tests (PGLITE_DIR vacío) — no toca la base de datos de desarrollo (.pglite).
    env: { PGLITE_DIR: '' },
  },
});
