/**
 * 危险操作确认机制
 * 在执行危险命令前询问用户确认
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import {
  analyzeDanger,
  requiresConfirmation,
  formatDangerAnalysis,
  type DangerAnalysis,
  type DangerLevel,
} from './danger-detector.ts';
import { logApproved, logRejected, logAutoBlocked } from './audit-log.ts';

export interface ConfirmationContext {
  sessionId?: string;
  connectionId?: string;
  source?: 'web' | 'cli' | 'tui' | 'unknown';
}

const confirmationContextStorage = new AsyncLocalStorage<ConfirmationContext>();

// 默认会话 ID（用于没有显式上下文的兼容场景）
let defaultSessionId = 'unknown';

/**
 * 在当前异步上下文内绑定确认上下文
 */
export function runWithConfirmationContext<T>(
  context: ConfirmationContext,
  fn: () => Promise<T> | T,
): Promise<T> | T {
  return confirmationContextStorage.run(context, fn);
}

/**
 * 获取当前确认上下文
 */
export function getConfirmationContext(): ConfirmationContext | undefined {
  return confirmationContextStorage.getStore();
}

/**
 * 设置默认会话 ID（兼容旧调用链）
 */
export function setSessionId(sessionId: string): void {
  const trimmed = sessionId?.trim();
  if (!trimmed) {
    return;
  }
  defaultSessionId = trimmed;
}

/**
 * 获取当前会话 ID
 */
export function getSessionId(): string {
  return resolveSessionIdForAudit();
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

// TUI 模式标志 - 在 TUI 模式下，危险操作自动批准（因为 stdin 被占用）
let tuiMode = false;

/**
 * 设置 TUI 模式
 * 在 TUI 模式下，由于 stdin 被 TUI 占用，危险操作会自动批准
 * 但会在 TUI 中显示警告
 */
export function setTuiMode(enabled: boolean): void {
  tuiMode = enabled;
}

/**
 * 是否处于 TUI 模式
 */
export function isTuiMode(): boolean {
  return tuiMode;
}

// WebSocket 确认回调 - Map<connectionId, callback>
const webSocketConfirmCallbacks = new Map<string, (command: string, analysis: DangerAnalysis) => Promise<boolean>>();

/**
 * 设置 WebSocket 确认回调
 * 用于 WebUI 模式下通过 WebSocket 请求用户确认
 */
export function setWebSocketConfirmCallback(connectionId: string, callback: (command: string, analysis: DangerAnalysis) => Promise<boolean>): void {
  webSocketConfirmCallbacks.set(connectionId, callback);
}

/**
 * 移除 WebSocket 确认回调
 */
export function removeWebSocketConfirmCallback(connectionId: string): void {
  webSocketConfirmCallbacks.delete(connectionId);
}

function resolveSessionIdForAudit(): string {
  const contextSessionId = confirmationContextStorage.getStore()?.sessionId?.trim();
  if (contextSessionId) {
    return contextSessionId;
  }
  return defaultSessionId;
}

function resolveWebSocketCallback(): {
  callbackId: string;
  callback: (command: string, analysis: DangerAnalysis) => Promise<boolean>;
} | null {
  const context = confirmationContextStorage.getStore();

  const callbackId = context?.connectionId?.trim();
  if (callbackId) {
    const callback = webSocketConfirmCallbacks.get(callbackId);
    if (callback) {
      return { callbackId, callback };
    }
  }

  const sessionFallbackId = context?.sessionId?.trim();
  if (sessionFallbackId) {
    const callback = webSocketConfirmCallbacks.get(sessionFallbackId);
    if (callback) {
      return {
        callbackId: sessionFallbackId,
        callback,
      };
    }
  }

  return null;
}

/**
 * 确认结果
 */
export interface ConfirmationResult {
  approved: boolean;
  analysis: DangerAnalysis;
}

/**
 * 请求用户确认危险操作（使用原始 stdin 读取）
 */
async function askUserConfirmation(command: string, analysis: DangerAnalysis): Promise<boolean> {
  // 显示危险分析
  console.log(formatDangerAnalysis(command, analysis));

  const prompt = analysis.level === 'critical'
    ? '\x1b[41m\x1b[37m 确定要执行此危险操作吗？输入 "YES" 确认: \x1b[0m '
    : '\x1b[33m 是否继续执行？(y/N): \x1b[0m ';

  process.stdout.write(prompt);

  // 使用 Bun 的 console 直接读取一行
  return new Promise((resolve) => {
    // 设置 stdin 为原始模式以便读取
    const stdin = process.stdin;
    const wasRaw = stdin.isRaw;

    if (stdin.isTTY && stdin.setRawMode) {
      stdin.setRawMode(false);
    }

    let input = '';

    const onData = (data: Buffer) => {
      const char = data.toString();

      // 处理回车
      if (char === '\n' || char === '\r') {
        stdin.removeListener('data', onData);
        if (stdin.isTTY && stdin.setRawMode && wasRaw) {
          stdin.setRawMode(true);
        }
        process.stdout.write('\n');

        const answer = input.trim();
        if (analysis.level === 'critical') {
          resolve(answer === 'YES');
        } else {
          resolve(answer.toLowerCase() === 'y');
        }
        return;
      }

      // 处理退格
      if (char === '\x7f' || char === '\b') {
        if (input.length > 0) {
          input = input.slice(0, -1);
          process.stdout.write('\b \b');
        }
        return;
      }

      // 处理 Ctrl+C
      if (char === '\x03') {
        stdin.removeListener('data', onData);
        if (stdin.isTTY && stdin.setRawMode && wasRaw) {
          stdin.setRawMode(true);
        }
        process.stdout.write('\n');
        resolve(false);
        return;
      }

      // 普通字符
      input += char;
      process.stdout.write(char);
    };

    stdin.on('data', onData);
    stdin.resume();
  });
}

/**
 * 检查命令并在需要时请求确认
 * 返回是否允许执行
 */
export async function checkAndConfirm(command: string): Promise<ConfirmationResult> {
  const analysis = analyzeDanger(command);
  const sessionIdForAudit = resolveSessionIdForAudit();

  // 安全命令直接通过
  if (!requiresConfirmation(analysis)) {
    return { approved: true, analysis };
  }

  // 清除当前行（可能有 spinner）
  process.stdout.write('\r\x1b[K');

  // 非交互模式下，危险操作自动拒绝
  if (!interactiveMode) {
    console.log(formatDangerAnalysis(command, analysis));
    console.log('\x1b[33m[非交互模式] 危险操作已自动跳过\x1b[0m\n');

    await logAutoBlocked(sessionIdForAudit, command, analysis.level, analysis.reasons);
    return { approved: false, analysis };
  }

  // TUI 模式下，危险操作自动批准（因为 stdin 被 TUI 占用）
  // 但会显示警告信息
  if (tuiMode) {
    console.log(formatDangerAnalysis(command, analysis));
    console.log('\x1b[33m[TUI 模式] 危险操作已自动批准（stdin 被 TUI 占用）\x1b[0m\n');

    // 仍然记录到审计日志
    await logApproved(sessionIdForAudit, command, analysis.level, analysis.reasons, { success: true });
    return { approved: true, analysis };
  }

  // WebSocket 模式下，通过上下文 connectionId 路由确认回调
  const wsCallback = resolveWebSocketCallback();
  if (wsCallback) {
    console.log(`[WebSocket] Requesting user confirmation via ${wsCallback.callbackId}...`);
    const approved = await wsCallback.callback(command, analysis);

    if (approved) {
      console.log('\x1b[32m✓ User confirmed via WebSocket\x1b[0m\n');
      await logApproved(sessionIdForAudit, command, analysis.level, analysis.reasons, { success: true });
    } else {
      console.log('\x1b[31m✗ User rejected via WebSocket\x1b[0m\n');
      await logRejected(sessionIdForAudit, command, analysis.level, analysis.reasons);
    }

    return { approved, analysis };
  }

  // 交互模式下请求用户确认（终端）
  const approved = await askUserConfirmation(command, analysis);

  if (approved) {
    console.log('\x1b[32m✓ 用户已确认，继续执行\x1b[0m\n');
  } else {
    console.log('\x1b[31m✗ 用户已取消操作\x1b[0m\n');
    await logRejected(sessionIdForAudit, command, analysis.level, analysis.reasons);
  }

  return { approved, analysis };
}

/**
 * 记录已执行的危险命令结果
 */
export async function logExecutionResult(
  command: string,
  analysis: DangerAnalysis,
  result: { success: boolean; exitCode?: number; error?: string },
  sessionId?: string,
): Promise<void> {
  if (requiresConfirmation(analysis)) {
    const sessionIdForAudit = sessionId?.trim() || resolveSessionIdForAudit();
    await logApproved(sessionIdForAudit, command, analysis.level, analysis.reasons, result);
  }
}

// 导出类型
export type { DangerLevel, DangerAnalysis };
export { analyzeDanger, requiresConfirmation, formatDangerAnalysis } from './danger-detector.ts';
