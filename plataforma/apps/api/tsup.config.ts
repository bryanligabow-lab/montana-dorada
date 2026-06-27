import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node20',
  // Empaqueta el código compartido del workspace dentro del bundle.
  noExternal: ['@asis/shared'],
  clean: true,
  sourcemap: false,
  dts: false,
});
