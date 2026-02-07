import { $ } from 'bun';
import type { ToolDef, ToolResult } from './registry.ts';
import {
  checkAndConfirm,
  logExecutionResult,
  requiresConfirmation,
} from '../utils/confirmation.ts';
import { recordContextEvent } from '../context/tracker.ts';

/**
 * exec 工具 - 执行 shell 命令
 * 集成危险操作确认机制
 */
export const execTool: ToolDef = {
  name: 'exec',
  description: '执行 shell 命令，获取 stdout/stderr。用于运行系统命令、脚本等。危险命令会请求用户确认。',
  schema: {
    type: 'object',
    properties: {
      command: {
        type: 'string',
        description: '要执行的 shell 命令',
      },
      cwd: {
        type: 'string',
        description: '工作目录，默认当前目录',
      },
      timeout: {
        type: 'number',
        description: '超时毫秒数，默认 30000',
      },
    },
    required: ['command'],
  },

  async execute(params): Promise<ToolResult> {
    const { command, cwd, timeout = 30000 } = params;

    // 检查危险操作并请求确认
    const { approved, analysis } = await checkAndConfirm(command);

    if (!approved) {
      return {
        success: false,
        error: `操作已取消: ${analysis.reasons.join(', ')}`,
        data: {
          dangerLevel: analysis.level,
          reasons: analysis.reasons,
          cancelled: true,
        },
      };
    }

    try {
      const proc = $`sh -c ${command}`.cwd(cwd || process.cwd()).quiet();

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Command timeout')), timeout)
      );

      const result = await Promise.race([proc, timeoutPromise]);

      const stdout = await (result as any).text();
      const exitCode = (result as any).exitCode;

      const execResult = {
        success: exitCode === 0,
        exitCode,
        error: exitCode !== 0 ? `Exit code: ${exitCode}` : undefined,
      };

      // 记录危险命令执行结果
      if (requiresConfirmation(analysis)) {
        await logExecutionResult(command, analysis, execResult);
      }

      const response = {
        success: exitCode === 0,
        data: {
          stdout: stdout || '',
          stderr: '',
          exitCode,
        },
      };
      await recordContextEvent({
        source: 'exec',
        summary: `${command}`,
        detail: `cwd=${cwd || process.cwd()} exit=${exitCode}`,
      });
      logSearchEventIfNeeded(command, cwd);
      return response;
    } catch (error: any) {
      const execResult = {
        success: false,
        exitCode: error.exitCode || 1,
        error: error.message,
      };

      // 记录危险命令执行失败
      if (requiresConfirmation(analysis)) {
        await logExecutionResult(command, analysis, execResult);
      }

      const response = {
        success: false,
        error: error.message || 'Command execution failed',
        data: {
          stdout: '',
          stderr: error.stderr?.toString() || error.message,
          exitCode: error.exitCode || 1,
        },
      };
      await recordContextEvent({
        source: 'exec',
        summary: `${command}`,
        detail: `cwd=${cwd || process.cwd()} error=${error.message || 'failed'}`,
      });
      logSearchEventIfNeeded(command, cwd, error.message);
      return response;
    }
  },
};

function logSearchEventIfNeeded(command: string, cwd?: string, error?: string) {
  const lower = command.toLowerCase();
  const searchKeywords = [' rg ', ' rg\n', ' grep ', ' grep\n', ' find ', 'search'];
  const matched = searchKeywords.some((keyword) => lower.includes(keyword.trim()));
  if (!matched) return;
  recordContextEvent({
    source: 'search',
    summary: command,
    detail: `${error ? 'failed' : 'success'} cwd=${cwd || process.cwd()}`,
  }).catch(() => {});
}
