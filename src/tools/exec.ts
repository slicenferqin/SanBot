import { $ } from 'bun';
import type { ToolDef, ToolResult } from './registry.ts';

/**
 * exec 工具 - 执行 shell 命令
 */
export const execTool: ToolDef = {
  name: 'exec',
  description: '执行 shell 命令，获取 stdout/stderr。用于运行系统命令、脚本等。',
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

    try {
      const proc = $`sh -c ${command}`.cwd(cwd || process.cwd()).quiet();

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Command timeout')), timeout)
      );

      const result = await Promise.race([proc, timeoutPromise]);

      const stdout = await (result as any).text();
      const exitCode = (result as any).exitCode;

      return {
        success: exitCode === 0,
        data: {
          stdout: stdout || '',
          stderr: '',
          exitCode,
        },
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Command execution failed',
        data: {
          stdout: '',
          stderr: error.stderr?.toString() || error.message,
          exitCode: error.exitCode || 1,
        },
      };
    }
  },
};
