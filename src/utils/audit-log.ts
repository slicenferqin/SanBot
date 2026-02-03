/**
 * 审计日志系统
 * 记录所有危险操作的执行情况
 */

import { existsSync } from 'fs';
import { mkdir, appendFile, readFile } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';
import type { DangerLevel } from './danger-detector.ts';

const SANBOT_DIR = join(homedir(), '.sanbot');
const AUDIT_DIR = join(SANBOT_DIR, 'audit');

export interface AuditEntry {
  timestamp: string;
  sessionId: string;
  command: string;
  dangerLevel: DangerLevel;
  reasons: string[];
  action: 'approved' | 'rejected' | 'auto_blocked';
  executionResult?: {
    success: boolean;
    exitCode?: number;
    error?: string;
  };
}

/**
 * 确保审计目录存在
 */
async function ensureAuditDir(): Promise<void> {
  if (!existsSync(AUDIT_DIR)) {
    await mkdir(AUDIT_DIR, { recursive: true });
  }
}

/**
 * 获取今天的审计日志文件路径
 */
function getTodayLogPath(): string {
  const today = new Date().toISOString().split('T')[0];
  return join(AUDIT_DIR, `${today}.jsonl`);
}

/**
 * 记录审计日志
 */
export async function logAudit(entry: AuditEntry): Promise<void> {
  await ensureAuditDir();

  const logPath = getTodayLogPath();
  const line = JSON.stringify(entry) + '\n';

  await appendFile(logPath, line, 'utf-8');
}

/**
 * 记录危险命令被批准执行
 */
export async function logApproved(
  sessionId: string,
  command: string,
  dangerLevel: DangerLevel,
  reasons: string[],
  result: { success: boolean; exitCode?: number; error?: string }
): Promise<void> {
  await logAudit({
    timestamp: new Date().toISOString(),
    sessionId,
    command,
    dangerLevel,
    reasons,
    action: 'approved',
    executionResult: result,
  });
}

/**
 * 记录危险命令被用户拒绝
 */
export async function logRejected(
  sessionId: string,
  command: string,
  dangerLevel: DangerLevel,
  reasons: string[]
): Promise<void> {
  await logAudit({
    timestamp: new Date().toISOString(),
    sessionId,
    command,
    dangerLevel,
    reasons,
    action: 'rejected',
  });
}

/**
 * 记录危险命令被自动阻止（critical 级别）
 */
export async function logAutoBlocked(
  sessionId: string,
  command: string,
  dangerLevel: DangerLevel,
  reasons: string[]
): Promise<void> {
  await logAudit({
    timestamp: new Date().toISOString(),
    sessionId,
    command,
    dangerLevel,
    reasons,
    action: 'auto_blocked',
  });
}

/**
 * 读取今天的审计日志
 */
export async function getTodayAuditLogs(): Promise<AuditEntry[]> {
  const logPath = getTodayLogPath();

  if (!existsSync(logPath)) {
    return [];
  }

  const content = await readFile(logPath, 'utf-8');
  const lines = content.trim().split('\n').filter(Boolean);

  return lines.map((line) => JSON.parse(line) as AuditEntry);
}

/**
 * 获取审计统计
 */
export async function getAuditStats(): Promise<{
  total: number;
  approved: number;
  rejected: number;
  autoBlocked: number;
  byLevel: Record<DangerLevel, number>;
}> {
  const logs = await getTodayAuditLogs();

  const stats = {
    total: logs.length,
    approved: 0,
    rejected: 0,
    autoBlocked: 0,
    byLevel: {
      safe: 0,
      warning: 0,
      danger: 0,
      critical: 0,
    } as Record<DangerLevel, number>,
  };

  for (const log of logs) {
    if (log.action === 'approved') stats.approved++;
    else if (log.action === 'rejected') stats.rejected++;
    else if (log.action === 'auto_blocked') stats.autoBlocked++;

    stats.byLevel[log.dangerLevel]++;
  }

  return stats;
}
