import path from 'node:path';
import {defineConfig, loadEnv, type Plugin} from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import {createChatHandler} from './server/chat.mjs';

// /api/chat в dev и preview: тот же обработчик, что и в server/serve.mjs для продакшена
function navigatorApi(env: Record<string, string>): Plugin {
  const handler = createChatHandler(env);
  // тела хуков в фигурных скобках: функция, возвращённая из configureServer, считается post-хуком
  return {
    name: 'navigator-api',
    configureServer(s) {
      s.middlewares.use('/api/chat', handler);
    },
    configurePreviewServer(s) {
      s.middlewares.use('/api/chat', handler);
    },
  };
}

export default defineConfig(({mode}) => ({
  // без префикса VITE_ — ключ не попадает в клиентский бандл, только в серверный обработчик
  plugins: [react(), tailwindcss(), navigatorApi(loadEnv(mode, import.meta.dirname, 'DAHL_'))],
  resolve: {alias: {'@': path.resolve(import.meta.dirname, 'src')}},
  server: {host: '127.0.0.1', port: 5175, strictPort: true},
  preview: {port: 4175},
  build: {target: 'es2022', assetsInlineLimit: 0, chunkSizeWarningLimit: 1200},
}));
