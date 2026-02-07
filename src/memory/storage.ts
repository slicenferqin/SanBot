/**
 * 记忆存储层 - 负责 L0 daily 日志的读写
 */

import { existsSync } from 'fs';
import { mkdir, appendFile, readFile, readdir } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';
import type { ConversationRecord, ToolCallRecord } from './types.ts';

/**
 * 记忆存储目录
 */
export const MEMORY_DIR = join(homedir(), '.sanbot', 'memory');
export const DAILY_DIR = join(MEMORY_DIR, 'daily');
export const EXTRACTED_DIR = join(MEMORY_DIR, 'extracted');
export const SUMMARY_DIR = join(MEMORY_DIR, 'summary');
export const SESSION_SUMMARY_DIR = join(MEMORY_DIR, 'session-summaries');

/**
 * 确保目录存在
 */
async function ensureDirs(): Promise<void> {
  for (const dir of [MEMORY_DIR, DAILY_DIR, EXTRACTED_DIR, SUMMARY_DIR, SESSION_SUMMARY_DIR]) {
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
 * 按 sessionId 读取今天的对话记录
 */
export async function loadSessionConversations(sessionId: string): Promise<ConversationRecord[]> {
  const all = await loadTodayConversations();
  return all.filter((c) => c.sessionId === sessionId);
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
