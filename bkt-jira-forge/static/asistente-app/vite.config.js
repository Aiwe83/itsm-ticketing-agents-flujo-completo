import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base: '' es obligatorio — el panel se sirve dentro de un iframe de Forge
// con una URL firmada, y las rutas absolutas (/assets/...) no resuelven ahí.
export default defineConfig({
  plugins: [react()],
  base: '',
  build: {
    outDir: 'build',
  },
});
