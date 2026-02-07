import { existsSync } from 'fs';
import { appendFile, readFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';
import { getSessionId } from '../utils/confirmation.ts';

const CONTEXT_DIR = join(homedir(), '.sanbot', 'context');
const EVENTS_PATH = join(CONTEXT_DIR, 'events.jsonl');
const SESSION_ID_PATTERN = /^[A-Za-z0-9._-]{1,128}$/;

export interface ContextEvent {
  timestamp: string;
  source: string;
  summary: string;
  detail?: string;
  sessionId?: string;
}

interface RecordContextEventInput {
  source: string;
  summary: string;
  detail?: string;
  sessionId?: string;
}

async function ensureContextDir(): Promise<void> {
  if (!existsSync(CONTEXT_DIR)) {
    await mkdir(CONTEXT_DIR, { recursive: true });
  }
}

function normalizeSessionId(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (!SESSION_ID_PATTERN.test(trimmed)) return undefined;
  if (trimmed === 'unknown') return undefined;
  return trimmed;
}

export async function recordContextEvent(event: RecordContextEventInput): Promise<void> {
  await ensureContextDir();

  const activeSessionId = normalizeSessionId(event.sessionId) ?? normalizeSessionId(getSessionId());

  const payload: ContextEvent = {
    timestamp: new Date().toISOString(),
    source: event.source,
    summary: event.summary,
    detail: event.detail,
    sessionId: activeSessionId,
  };

  await appendFile(EVENTS_PATH, JSON.stringify(payload) + '\n', 'utf-8');
}

export async function getRecentContextEvents(limit: number = 10, sessionId?: string): Promise<ContextEvent[]> {
  await ensureContextDir();
  if (!existsSync(EVENTS_PATH)) {
    return [];
  }

  const safeLimit = Number.isFinite(limit) && limit > 0
    ? Math.min(Math.floor(limit), 200)
    : 10;

  const normalizedSessionId = normalizeSessionId(sessionId);
  const content = await readFile(EVENTS_PATH, 'utf-8');
  const lines = content
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.length) {
    return [];
  }

  const events: ContextEvent[] = lines.map((line) => {
    try {
      const parsed = JSON.parse(line) as ContextEvent;
      return {
        timestamp: parsed.timestamp || new Date().toISOString(),
        source: parsed.source || 'context',
        summary: parsed.summary || '',
        detail: parsed.detail,
        sessionId: normalizeSessionId(parsed.sessionId),
      };
    } catch {
      return {
        timestamp: new Date().toISOString(),
        source: 'context',
        summary: line,
      };
    }
  });

  const filtered = normalizedSessionId
    ? events.filter((event) => !event.sessionId || event.sessionId === normalizedSessionId)
    : events;

  return filtered.slice(-safeLimit).reverse();
}
