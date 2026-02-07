import { existsSync } from 'fs';
import { appendFile, readFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';

const CONTEXT_DIR = join(homedir(), '.sanbot', 'context');
const EVENTS_PATH = join(CONTEXT_DIR, 'events.jsonl');

export interface ContextEvent {
  timestamp: string;
  source: string;
  summary: string;
  detail?: string;
}

async function ensureContextDir(): Promise<void> {
  if (!existsSync(CONTEXT_DIR)) {
    await mkdir(CONTEXT_DIR, { recursive: true });
  }
}

export async function recordContextEvent(event: { source: string; summary: string; detail?: string }): Promise<void> {
  await ensureContextDir();
  const payload: ContextEvent = {
    timestamp: new Date().toISOString(),
    source: event.source,
    summary: event.summary,
    detail: event.detail,
  };
  await appendFile(EVENTS_PATH, JSON.stringify(payload) + '\n', 'utf-8');
}

export async function getRecentContextEvents(limit: number = 10): Promise<ContextEvent[]> {
  await ensureContextDir();
  if (!existsSync(EVENTS_PATH)) {
    return [];
  }
  const content = await readFile(EVENTS_PATH, 'utf-8');
  const lines = content
    .trim()
    .split('\n')
    .filter(Boolean);
  if (!lines.length) {
    return [];
  }
  const slice = lines.slice(-Math.max(limit, 1));
  return slice.map((line) => {
    try {
      return JSON.parse(line) as ContextEvent;
    } catch {
      return {
        timestamp: new Date().toISOString(),
        source: 'context',
        summary: line,
      };
    }
  }).reverse();
}
