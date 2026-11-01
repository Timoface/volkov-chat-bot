// POST /api/chat — прокси к языковой модели «Навигатора».
// Ключ API живёт только на сервере (.env.local); браузер получает поток ответа без ключа.
// Системный промпт собирается здесь: инструкция из navigator-prompt.md + только те статьи,
// что действуют и разрешены выбранному профилю — закрытые документы модель не видит вовсе.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {ARTICLES, CONTACTS, ROLES, isCurrent} from '../src/navigator/knowledge.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const INSTRUCTIONS = path.join(here, 'navigator-prompt.md');

const MAX_BODY = 32 * 1024;
const MAX_TURNS = 12;
const MAX_CHARS = 2000;
const RATE = {windowMs: 60_000, max: 20};
const UPSTREAM_TIMEOUT_MS = 90_000;

export function buildSystemPrompt(role) {
  const articles = ARTICLES.filter(isCurrent);
  const open = articles.filter((a) => a.roles.includes(role));
  const closed = articles.filter((a) => !a.roles.includes(role));
  const contacts = Object.entries(CONTACTS)
    .map(([id, c]) => `- ${id}: ${c.service} — ${c.person}, ${c.position}; ${c.room}; ${c.phone}; ${c.hours}`)
    .join('\n');
  const openText = open
    .map((a) => `### ${a.id} — ${a.title}\nСлужба: ${a.service}. Проверено: ${a.updated}.\n${a.answer}`)
    .join('\n\n');
  const closedText = closed.length
    ? closed.map((a) => `- ${a.id} — ${a.title} (доступно: ${a.roles.map((r) => ROLES[r].label).join(', ')}; служба: ${a.service})`).join('\n')
    : '- нет';
  const todayFormatted = new Date().toLocaleDateString('ru-RU', {day: 'numeric', month: 'long', year: 'numeric'});
  // файл читается на каждый запрос — правки инструкции работают без перезапуска
  return `${fs.readFileSync(INSTRUCTIONS, 'utf8').trim()}

## Сотрудник
Профиль доступа: ${ROLES[role].label} (${ROLES[role].hint}). Сегодня: ${todayFormatted}

## База знаний (действующие документы, доступные этому профилю)
${openText}

## Закрыто для этого профиля (содержание не раскрывать)
${closedText}

## Контакты служб (id: служба — сотрудник; кабинет; телефон; часы)
${contacts}
- Справочная служба: вн. 1000`;
}

const hits = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const list = (hits.get(ip) ?? []).filter((t) => now - t < RATE.windowMs);
  list.push(now);
  hits.set(ip, list);
  return list.length > RATE.max;
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) reject(new Error('too_large'));
      else chunks.push(c);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new Error('bad_json'));
      }
    });
    req.on('error', reject);
  });
}

const sendJson = (res, status, body) => {
  res.writeHead(status, {'Content-Type': 'application/json; charset=utf-8'});
  res.end(JSON.stringify(body));
};

// перегрузка модели у провайдера — пробуем следующую из списка
const isCapacityError = (status, text) => status === 429 || status === 503 || /concurrency|capacity|overloaded/i.test(text);

export function createChatHandler(env) {
  const url = env.DAHL_API_URL;
  const key = env.DAHL_API_KEY;
  const models = [env.DAHL_MODEL, ...(env.DAHL_FALLBACK_MODELS ?? '').split(',')].map((m) => m?.trim()).filter(Boolean);

  return async function handleChat(req, res) {
    if (req.method !== 'POST') return sendJson(res, 405, {error: 'method_not_allowed'});
    if (!url || !key || !models.length) return sendJson(res, 503, {error: 'not_configured'});
    const ip = req.socket.remoteAddress ?? 'unknown';
    if (rateLimited(ip)) return sendJson(res, 429, {error: 'rate_limited'});

    let body;
    try {
      body = await readJson(req);
    } catch (e) {
      return sendJson(res, 400, {error: e.message});
    }
    const role = body?.role;
    if (!Object.hasOwn(ROLES, role)) return sendJson(res, 400, {error: 'bad_role'});
    const turns = Array.isArray(body.messages) ? body.messages : [];
    const history = turns
      .filter((m) => (m?.role === 'user' || m?.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
      .slice(-MAX_TURNS)
      .map((m) => ({role: m.role, content: m.content.slice(0, MAX_CHARS)}));
    if (history.at(-1)?.role !== 'user') return sendJson(res, 400, {error: 'no_question'});

    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), UPSTREAM_TIMEOUT_MS);
    res.on('close', () => abort.abort());

    try {
      for (const model of models) {
        const upstream = await fetch(url, {
          method: 'POST',
          signal: abort.signal,
          headers: {Authorization: `Bearer ${key}`, 'Content-Type': 'application/json'},
          body: JSON.stringify({
            model,
            stream: true,
            temperature: 0.3,
            max_tokens: 1600,
            messages: [{role: 'system', content: buildSystemPrompt(role)}, ...history],
          }),
        });
        if (!upstream.ok || !upstream.body) {
          const text = await upstream.text().catch(() => '');
          if (isCapacityError(upstream.status, text)) continue;
          console.error(`[navigator] ${model}: ${upstream.status} ${text.slice(0, 300)}`);
          return sendJson(res, 502, {error: 'upstream_error'});
        }
        res.writeHead(200, {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          'X-Accel-Buffering': 'no',
          'X-Navigator-Model': model,
        });
        for await (const chunk of upstream.body) res.write(chunk);
        return res.end();
      }
      return sendJson(res, 503, {error: 'all_models_busy'});
    } catch (e) {
      if (!res.headersSent) return sendJson(res, abort.signal.aborted ? 504 : 502, {error: 'upstream_failed'});
      console.error('[navigator] stream interrupted:', e.message);
      res.end();
    } finally {
      clearTimeout(timer);
    }
  };
}
