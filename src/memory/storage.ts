/**
 * 记忆存储层 - 负责 L0 daily 日志的读写
 */

import { existsSync } from 'fs';
import { mkdir, appendFile, readFile, readdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';
import type { ConversationRecord, ToolCallRecord } from './types.ts';

/**
 * 记忆存储目录
 */
const MEMORY_DIR_OVERRIDE = process.env.SANBOT_MEMORY_DIR?.trim();
export const MEMORY_DIR = MEMORY_DIR_OVERRIDE
  ? MEMORY_DIR_OVERRIDE
  : join(homedir(), '.sanbot', 'memory');
export const DAILY_DIR = join(MEMORY_DIR, 'daily');
export const EXTRACTED_DIR = join(MEMORY_DIR, 'extracted');
export const SUMMARY_DIR = join(MEMORY_DIR, 'summary');
export const SESSION_SUMMARY_DIR = join(MEMORY_DIR, 'session-summaries');
export const SESSION_CONFIG_DIR = join(MEMORY_DIR, 'session-configs');

const SESSION_ID_PATTERN = /^[A-Za-z0-9._-]{1,128}$/;
const PROVIDER_ID_PATTERN = /^[A-Za-z0-9._-]{1,128}$/;

export interface SessionLLMConfigRecord {
  sessionId: string;
  providerId: string;
  model: string;
  temperature: number;
  updatedAt: string;
}

export interface SaveSessionLLMConfigInput {
  providerId: string;
  model: string;
  temperature?: number;
}


export interface LoadSessionConversationsOptions {
  scope?: 'today' | 'all';
  limit?: number;
}

export interface ListSessionDigestsOptions {
  days?: number;
  limit?: number;
}

export interface SessionDigest {
  sessionId: string;
  title: string;
  startedAt: string;
  lastActivityAt: string;
  turns: number;
  preview: string;
}

/**
 * 确保目录存在
 */
async function ensureDirs(): Promise<void> {
  for (const dir of [MEMORY_DIR, DAILY_DIR, EXTRACTED_DIR, SUMMARY_DIR, SESSION_SUMMARY_DIR, SESSION_CONFIG_DIR]) {
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }
  }
}

/**
 * 获取今天的日期字符串
 */
function getTodayDate(): string {
  const [date] = new Date().toISOString().split('T');
  return date || new Date().toISOString();
}

/**
 * 生成唯一 ID
 */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function truncate(text: string, maxLength: number): string {
  const normalized = text.trim();
  if (!normalized) return '';
  if (normalized.length <= maxLength) return normalized;
  return normalized.slice(0, Math.max(0, maxLength - 3)) + '...';
}

function normalizeSessionId(sessionId: string): string {
  const normalized = sessionId.trim();
  if (!SESSION_ID_PATTERN.test(normalized)) {
    throw new Error('Invalid sessionId for session config');
  }
  return normalized;
}

function normalizeProviderId(providerId: string): string {
  const normalized = providerId.trim();
  if (!PROVIDER_ID_PATTERN.test(normalized)) {
    throw new Error('Invalid providerId for session config');
  }
  return normalized;
}

function normalizeModel(model: string): string {
  const normalized = model.trim();
  if (!normalized) {
    throw new Error('Model is required for session config');
  }
  return normalized;
}

function normalizeTemperature(temperature: number | undefined): number {
  if (typeof temperature !== 'number' || Number.isNaN(temperature)) {
    return 0.3;
  }
  return Math.min(1, Math.max(0, temperature));
}

/**
 * 保存对话到 daily 日志
 */
export async function saveConversation(
  sessionId: string,
  userMessage: string,
  assistantResponse: string,
  toolCalls?: ToolCallRecord[]
): Promise<ConversationRecord> {
  await ensureDirs();

  const record: ConversationRecord = {
    id: generateId(),
    timestamp: new Date().toISOString(),
    sessionId,
    userMessage,
    assistantResponse,
    toolCalls,
  };

  const dailyFile = join(DAILY_DIR, `${getTodayDate()}.jsonl`);
  await appendFile(dailyFile, JSON.stringify(record) + '\n', 'utf-8');

  return record;
}

/**
 * 读取指定日期的对话记录
 */
export async function loadDailyConversations(
  date: string
): Promise<ConversationRecord[]> {
  const dailyFile = join(DAILY_DIR, `${date}.jsonl`);

  if (!existsSync(dailyFile)) {
    return [];
  }

  const content = await readFile(dailyFile, 'utf-8');
  const lines = content.trim().split('\n').filter(Boolean);

  return lines.map((line) => JSON.parse(line) as ConversationRecord);
}

/**
 * 获取所有 daily 文件日期列表
 */
export async function listDailyDates(): Promise<string[]> {
  await ensureDirs();

  const files = await readdir(DAILY_DIR);
  return files
    .filter((f) => f.endsWith('.jsonl'))
    .map((f) => f.replace('.jsonl', ''))
    .sort();
}

/**
 * 读取今天的对话记录
 */
export async function loadTodayConversations(): Promise<ConversationRecord[]> {
  return loadDailyConversations(getTodayDate());
}

/**
 * 按 sessionId 读取对话记录（默认仅今天，可扩展到全量）
 */
export async function loadSessionConversations(
  sessionId: string,
  options: LoadSessionConversationsOptions = {}
): Promise<ConversationRecord[]> {
  const scope = options.scope ?? 'today';
  const limit = Number.isFinite(options.limit) && (options.limit ?? 0) > 0
    ? Math.floor(options.limit as number)
    : null;

  if (scope === 'today') {
    const all = await loadTodayConversations();
    const filtered = all.filter((c) => c.sessionId === sessionId);
    return limit ? filtered.slice(-limit) : filtered;
  }

  const dates = (await listDailyDates()).slice().sort().reverse();
  const collected: ConversationRecord[] = [];

  for (const date of dates) {
    const dayRecords = await loadDailyConversations(date);
    for (let i = dayRecords.length - 1; i >= 0; i--) {
      const record = dayRecords[i];
      if (record?.sessionId === sessionId) {
        collected.push(record);
        if (limit && collected.length >= limit) {
          return collected.reverse();
        }
      }
    }
  }

  return collected.reverse();
}

export async function listSessionDigests(options: ListSessionDigestsOptions = {}): Promise<SessionDigest[]> {
  const days = Number.isFinite(options.days) && (options.days ?? 0) > 0
    ? Math.min(Math.floor(options.days as number), 30)
    : 7;

  const limit = Number.isFinite(options.limit) && (options.limit ?? 0) > 0
    ? Math.min(Math.floor(options.limit as number), 200)
    : 50;

  const cutoffMs = Date.now() - days * 24 * 60 * 60 * 1000;

  const dates = (await listDailyDates()).slice().sort().reverse();

  type SessionAggregate = {
    sessionId: string;
    title: string;
    preview: string;
    turns: number;
    startedAt: string;
    startMs: number;
    lastActivityAt: string;
    lastMs: number;
  };

  const aggregates = new Map<string, SessionAggregate>();

  for (const date of dates) {
    const dayRecords = await loadDailyConversations(date);

    for (const record of dayRecords) {
      if (!record?.sessionId) continue;

      const timestampMs = Date.parse(record.timestamp);
      if (!Number.isFinite(timestampMs)) continue;
      if (timestampMs < cutoffMs) continue;

      let aggregate = aggregates.get(record.sessionId);
      if (!aggregate) {
        aggregate = {
          sessionId: record.sessionId,
          title: '',
          preview: '',
          turns: 0,
          startedAt: record.timestamp,
          startMs: timestampMs,
          lastActivityAt: record.timestamp,
          lastMs: timestampMs,
        };
        aggregates.set(record.sessionId, aggregate);
      }

      aggregate.turns += 1;

      const userMessage = record.userMessage?.trim() || '';
      if (!aggregate.title && userMessage) {
        aggregate.title = truncate(userMessage, 48);
      }

      if (timestampMs < aggregate.startMs) {
        aggregate.startMs = timestampMs;
        aggregate.startedAt = record.timestamp;
        if (userMessage) {
          aggregate.title = truncate(userMessage, 48);
        }
      }

      if (timestampMs >= aggregate.lastMs) {
        aggregate.lastMs = timestampMs;
        aggregate.lastActivityAt = record.timestamp;
        const assistantPreview = record.assistantResponse?.trim() || '';
        aggregate.preview = assistantPreview ? truncate(assistantPreview, 72) : aggregate.preview;
      }
    }
  }

  const digests = Array.from(aggregates.values())
    .sort((a, b) => b.lastMs - a.lastMs)
    .slice(0, limit)
    .map((aggregate) => ({
      sessionId: aggregate.sessionId,
      title: aggregate.title || `Session ${aggregate.sessionId.slice(0, 8)}`,
      startedAt: aggregate.startedAt,
      lastActivityAt: aggregate.lastActivityAt,
      turns: aggregate.turns,
      preview: aggregate.preview,
    }));

  return digests;
}

export async function saveSessionLLMConfig(
  sessionId: string,
  input: SaveSessionLLMConfigInput
): Promise<SessionLLMConfigRecord> {
  await ensureDirs();

  const normalizedSessionId = normalizeSessionId(sessionId);
  const record: SessionLLMConfigRecord = {
    sessionId: normalizedSessionId,
    providerId: normalizeProviderId(input.providerId),
    model: normalizeModel(input.model),
    temperature: normalizeTemperature(input.temperature),
    updatedAt: new Date().toISOString(),
  };

  const filePath = join(SESSION_CONFIG_DIR, `${normalizedSessionId}.json`);
  await writeFile(filePath, JSON.stringify(record, null, 2), 'utf-8');

  return record;
}

export async function loadSessionLLMConfig(sessionId: string): Promise<SessionLLMConfigRecord | null> {
  let normalizedSessionId: string;
  try {
    normalizedSessionId = normalizeSessionId(sessionId);
  } catch {
    return null;
  }

  const filePath = join(SESSION_CONFIG_DIR, `${normalizedSessionId}.json`);
  if (!existsSync(filePath)) {
    return null;
  }

  try {
    const raw = await readFile(filePath, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<SessionLLMConfigRecord> | null;

    if (!parsed || typeof parsed !== 'object') {
      return null;
    }

    const providerId = typeof parsed.providerId === 'string'
      ? parsed.providerId.trim()
      : '';
    const model = typeof parsed.model === 'string'
      ? parsed.model.trim()
      : '';

    if (!PROVIDER_ID_PATTERN.test(providerId) || !model) {
      return null;
    }

    const updatedAt = typeof parsed.updatedAt === 'string' && parsed.updatedAt.trim()
      ? parsed.updatedAt
      : new Date().toISOString();

    return {
      sessionId: normalizedSessionId,
      providerId,
      model,
      temperature: normalizeTemperature(parsed.temperature),
      updatedAt,
    };
  } catch (error) {
    console.warn(`[storage] Failed to load session LLM config for ${normalizedSessionId}:`, error);
    return null;
  }
}

export async function appendSessionSummary(sessionId: string, summary: string): Promise<void> {
  if (!summary) return;
  await ensureDirs();
  const summaryFile = join(SESSION_SUMMARY_DIR, `${sessionId}.md`);
  const timestamp = new Date().toISOString();
  const content = '## ' + timestamp + '\n' + summary + '\n\n';
  await appendFile(summaryFile, content, 'utf-8');
}

export async function appendExtractedMemory(category: string, text: string): Promise<void> {
  const trimmed = text?.trim();
  if (!trimmed) return;
  await ensureDirs();
  const filePath = join(EXTRACTED_DIR, `${category}.md`);
  const timestamp = new Date().toISOString();
  const line = '- [' + timestamp + '] ' + trimmed + '\n';
  await appendFile(filePath, line, 'utf-8');
}
