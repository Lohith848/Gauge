import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': resolve(rootDir, 'src') } },
  build: { target: 'es2022', sourcemap: false, cssCodeSplit: true },
  test: {
    environment: 'jsdom',
    include: ['tests/unit/**/*.test.ts?(x)', 'tests/component/**/*.test.ts?(x)'],
  },
});
