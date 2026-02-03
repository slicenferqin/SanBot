/**
 * 危险操作确认机制
 * 在执行危险命令前询问用户确认
 */

import * as readline from 'readline';
import {
  analyzeDanger,
  requiresConfirmation,
  formatDangerAnalysis,
  type DangerAnalysis,
  type DangerLevel,
} from './danger-detector.ts';
import { logApproved, logRejected, logAutoBlocked } from './audit-log.ts';

// 全局会话 ID（由 Agent 设置）
let currentSessionId = 'unknown';

/**
 * 设置当前会话 ID
 */
export function setSessionId(sessionId: string): void {
  currentSessionId = sessionId;
}

/**
 * 获取当前会话 ID
 */
export function getSessionId(): string {
  return currentSessionId;
}

// 是否启用交互式确认（非交互模式下自动拒绝危险操作）
let interactiveMode = false;

/**
 * 设置交互模式
 */
export function setInteractiveMode(enabled: boolean): void {
  interactiveMode = enabled;
}

/**
 * 是否处于交互模式
 */
export function isInteractiveMode(): boolean {
  return interactiveMode;
}

/**
 * 确认结果
 */
export interface ConfirmationResult {
  approved: boolean;
  analysis: DangerAnalysis;
}

/**
 * 请求用户确认危险操作
 */
async function askUserConfirmation(command: string, analysis: DangerAnalysis): Promise<boolean> {
  return new Promise((resolve) => {
    // 显示危险分析
    console.log(formatDangerAnalysis(command, analysis));

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const prompt = analysis.level === 'critical'
      ? '\x1b[41m\x1b[37m 确定要执行此危险操作吗？输入 "YES" 确认: \x1b[0m '
      : '\x1b[33m 是否继续执行？(y/N): \x1b[0m ';

    rl.question(prompt, (answer) => {
      rl.close();

      if (analysis.level === 'critical') {
        // Critical 级别需要输入完整的 "YES"
        resolve(answer.trim() === 'YES');
      } else {
        // 其他级别 y/Y 即可
        resolve(answer.trim().toLowerCase() === 'y');
      }
    });
  });
}

/**
 * 检查命令并在需要时请求确认
 * 返回是否允许执行
 */
export async function checkAndConfirm(command: string): Promise<ConfirmationResult> {
  const analysis = analyzeDanger(command);

  // 安全命令直接通过
  if (!requiresConfirmation(analysis)) {
    return { approved: true, analysis };
  }

  // 非交互模式下，危险操作自动拒绝
  if (!interactiveMode) {
    console.log(formatDangerAnalysis(command, analysis));
    console.log('\x1b[33m[非交互模式] 危险操作已自动跳过\x1b[0m\n');

    await logAutoBlocked(currentSessionId, command, analysis.level, analysis.reasons);
    return { approved: false, analysis };
  }

  // 交互模式下请求用户确认
  const approved = await askUserConfirmation(command, analysis);

  if (approved) {
    console.log('\x1b[32m✓ 用户已确认，继续执行\x1b[0m\n');
  } else {
    console.log('\x1b[31m✗ 用户已取消操作\x1b[0m\n');
    await logRejected(currentSessionId, command, analysis.level, analysis.reasons);
  }

  return { approved, analysis };
}

/**
 * 记录已执行的危险命令结果
 */
export async function logExecutionResult(
  command: string,
  analysis: DangerAnalysis,
  result: { success: boolean; exitCode?: number; error?: string }
): Promise<void> {
  if (requiresConfirmation(analysis)) {
    await logApproved(currentSessionId, command, analysis.level, analysis.reasons, result);
  }
}

// 导出类型
export type { DangerLevel, DangerAnalysis };
export { analyzeDanger, requiresConfirmation, formatDangerAnalysis } from './danger-detector.ts';
