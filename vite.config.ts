import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, rootDir, '');
  const groqApiKey = env.GROQ_API_KEY || process.env.GROQ_API_KEY;
  return {
    plugins: [react(), tailwindcss(), {
      name: 'gauge-groq-api',
      configureServer(server) {
        server.middlewares.use('/api/analyze', (req, res) => {
          void import('./src/server/groq-handler.ts')
            .then(({ handleGroqRequest }) => handleGroqRequest(req, res, groqApiKey))
            .catch(() => {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json; charset=utf-8');
              res.end(JSON.stringify({ error: 'The analysis service could not start.' }));
            });
        });
      },
    }],
    resolve: { alias: { '@': resolve(rootDir, 'src') } },
    build: { target: 'es2022', sourcemap: false, cssCodeSplit: true },
    test: {
      environment: 'jsdom',
      include: ['tests/unit/**/*.test.ts?(x)', 'tests/component/**/*.test.ts?(x)'],
    },
  };
});
