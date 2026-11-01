import type {IncomingMessage, ServerResponse} from 'node:http';

export function buildSystemPrompt(role: string): string;
export function createChatHandler(env: Record<string, string | undefined>): (req: IncomingMessage, res: ServerResponse) => Promise<void>;
