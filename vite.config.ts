import { resolve } from 'node:path';
import { defineConfig } from 'vite';

// Duas páginas: o site de vendas (/) e o sistema com login (/app/).
export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        site: resolve(__dirname, 'index.html'),
        app: resolve(__dirname, 'app/index.html'),
      },
    },
  },
});
