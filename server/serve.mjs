// Продакшен-сервер: отдаёт собранный dist/ и обрабатывает /api/chat. Без зависимостей.
// Запуск: npm run build && npm start   (переменные DAHL_* — из окружения или .env.local)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createChatHandler} from './chat.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
for (const file of ['.env', '.env.local']) {
  const p = path.join(root, file);
  if (fs.existsSync(p)) process.loadEnvFile(p);
}
const handleChat = createChatHandler(process.env);
const TYPES = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.glb': 'model/gltf-binary', '.svg': 'image/svg+xml', '.json': 'application/json'};

http
  .createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (url.pathname === '/api/chat') return handleChat(req, res);
    let file = path.join(dist, decodeURIComponent(url.pathname));
    if (!file.startsWith(dist) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(dist, 'index.html');
    const ext = path.extname(file);
    res.writeHead(200, {
      'Content-Type': TYPES[ext] ?? 'application/octet-stream',
      'Cache-Control': file.includes(`${path.sep}assets${path.sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache',
    });
    fs.createReadStream(file).pipe(res);
  })
  .listen(Number(process.env.PORT ?? 8080), () => console.log(`Навигатор: http://localhost:${process.env.PORT ?? 8080}`));
