// Клиент /api/chat: читает поток SSE (формат OpenAI) и отдаёт текст по мере генерации.
import {CONTACTS, type ServiceId} from '@/navigator/knowledge';

export interface Turn {
  role: 'user' | 'assistant';
  content: string;
}

export class ChatUnavailable extends Error {}

export async function streamAnswer(opts: {
  role: string;
  history: Turn[];
  signal: AbortSignal;
  onText: (full: string) => void;
  onThinking: () => void;
}): Promise<{text: string; model: string}> {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({role: opts.role, messages: opts.history}),
    signal: opts.signal,
  });
  if (!res.ok || !res.body) throw new ChatUnavailable(`api ${res.status}`);
  const model = res.headers.get('X-Navigator-Model') ?? '';

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buf = '';
  let text = '';
  for (;;) {
    const {done, value} = await reader.read();
    if (done) break;
    buf += value;
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (data === '[DONE]') continue;
      let delta: {content?: string; reasoning?: string; reasoning_content?: string} | undefined;
      try {
        delta = JSON.parse(data).choices?.[0]?.delta;
      } catch {
        continue;
      }
      if (delta?.content) {
        text += delta.content;
        opts.onText(text);
      } else if (delta?.reasoning || delta?.reasoning_content) {
        opts.onThinking();
      }
    }
  }
  if (!text.trim()) throw new ChatUnavailable('empty');
  return {text, model};
}

const MARK = /\[\[\s*source\s*:\s*([\w-]+)\s*;\s*service\s*:\s*([\w-]+)\s*\]\]/i;

// убирает служебную метку (и всё, что модель дописала после неё) и недописанный хвост метки во время стрима
export function visibleText(raw: string) {
  // некоторые модели (MiniMax) пишут рассуждения в тексте ответа: <think>…</think>, в т. ч. ещё незакрытый
  raw = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/<think>[\s\S]*$/i, '').trimStart();
  const at = raw.search(/\[\[\s*source/i);
  const text = at >= 0 ? raw.slice(0, at) : raw.replace(/\[\[[^\]]*$/, '').replace(/\[$/, '');
  return text.trimEnd();
}

export function parseMark(raw: string): {source: string | null; service: ServiceId | null} {
  const m = raw.match(MARK);
  const source = m && m[1] !== 'none' ? m[1] : null;
  const service = m && Object.hasOwn(CONTACTS, m[2]) ? (m[2] as ServiceId) : null;
  return {source, service};
}

export const modelLabel = (id: string) => id.split('/').pop() ?? id;
