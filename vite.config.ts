import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// "npm run build" gera o site para a Vercel (pasta dist).
// "npm run build:arquivo-unico" gera um único index.html, que funciona até aberto direto do disco.
export default defineConfig(({ mode }) => ({
  plugins: mode === 'arquivo-unico' ? [viteSingleFile()] : [],
  build: { chunkSizeWarningLimit: 1200, ...(mode === 'arquivo-unico' ? { outDir: 'dist-arquivo-unico' } : {}) },
}));
