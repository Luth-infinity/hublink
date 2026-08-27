import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

const dir = import.meta.dirname;

export default defineConfig({
  root: path.resolve(dir, 'src/renderer'),
  // Chemins relatifs : la page est chargee via file:// dans l'app packagee.
  base: './',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(dir, 'src/renderer/src') }
  },
  server: { port: 5273, strictPort: true },
  build: {
    outDir: path.resolve(dir, 'src/renderer/dist'),
    emptyOutDir: true,
    target: 'chrome130'
  }
});
