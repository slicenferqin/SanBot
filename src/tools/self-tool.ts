import { existsSync } from 'fs';
import { mkdir, writeFile, readdir, chmod } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';
import { $ } from 'bun';
import type { ToolDef, ToolResult } from './registry.ts';
import { registerTool, loadToolRegistry, TOOLS_DIR } from './tool-registry-center.ts';

/**
 * 确保工具目录存在
 */
async function ensureToolsDir(): Promise<void> {
  if (!existsSync(TOOLS_DIR)) {
    await mkdir(TOOLS_DIR, { recursive: true });
  }
}

/**
 * create_tool 工具 - 创建新的 CLI 工具
 */
export const createToolTool: ToolDef = {
  name: 'create_tool',
  description: `创建一个新的 CLI 工具并注册到工具中心。
当你遇到能力缺口时（比如需要解析特定格式、处理特定数据等），可以创建一个工具来解决。
工具会被保存为可执行脚本，并自动注册，后续可以像内置工具一样直接调用。
支持 Python 和 Bash 脚本。`,
  schema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: '工具名称（小写字母、数字、下划线，如 csv_parser）',
      },
      description: {
        type: 'string',
        description: '工具的功能描述',
      },
      language: {
        type: 'string',
        enum: ['python', 'bash'],
        description: '脚本语言',
      },
      code: {
        type: 'string',
        description: '工具的完整代码（包含 shebang）',
      },
      parameters: {
        type: 'object',
        description: '工具的参数定义（JSON Schema 格式），用于注册到工具中心',
      },
    },
    required: ['name', 'description', 'language', 'code'],
  },

  async execute(params): Promise<ToolResult> {
    const { name, description, language, code, parameters } = params;

    // 验证工具名称
    if (!/^[a-z][a-z0-9_]*$/.test(name)) {
      return {
        success: false,
        error: 'Tool name must start with lowercase letter and contain only lowercase letters, numbers, and underscores',
      };
    }

    try {
      await ensureToolsDir();

      const toolPath = join(TOOLS_DIR, name);

      // 确保代码有正确的 shebang
      let finalCode = code;
      if (!code.startsWith('#!')) {
        if (language === 'python') {
          finalCode = '#!/usr/bin/env python3\n' + code;
        } else if (language === 'bash') {
          finalCode = '#!/bin/bash\n' + code;
        }
      }

      // 写入工具文件
      await writeFile(toolPath, finalCode, 'utf-8');

      // 设置可执行权限
      await chmod(toolPath, 0o755);

      // 注册到工具中心
      const now = new Date().toISOString();
      await registerTool({
        name,
        description,
        language,
        schema: parameters || {
          type: 'object',
          properties: {},
        },
        createdAt: now,
        updatedAt: now,
      });

      // 测试工具是否可执行
      try {
        const testResult = await $`${toolPath} --help 2>&1 || ${toolPath} -h 2>&1 || echo "Tool created"`.quiet();
        const testOutput = await testResult.text();

        return {
          success: true,
          data: {
            path: toolPath,
            name,
            description,
            language,
            registered: true,
            testOutput: testOutput.slice(0, 500),
          },
        };
      } catch {
        return {
          success: true,
          data: {
            path: toolPath,
            name,
            description,
            language,
            registered: true,
            note: 'Tool created and registered, but test execution failed. It may still work with proper arguments.',
          },
        };
      }
    } catch (error: any) {
      return {
        success: false,
        error: `Failed to create tool: ${error.message}`,
      };
    }
  },
};

/**
 * list_tools 工具 - 列出已注册的工具
 */
export const listToolsTool: ToolDef = {
  name: 'list_tools',
  description: '列出所有已注册的自创建工具及其描述',
  schema: {
    type: 'object',
    properties: {},
  },

  async execute(): Promise<ToolResult> {
    try {
      const registry = await loadToolRegistry();
      const tools = Object.values(registry.tools).map((t) => ({
        name: t.name,
        description: t.description,
        language: t.language,
        createdAt: t.createdAt,
      }));

      return {
        success: true,
        data: {
          toolsDir: TOOLS_DIR,
          tools,
          count: tools.length,
        },
      };
    } catch (error: any) {
      return {
        success: false,
        error: `Failed to list tools: ${error.message}`,
      };
    }
  },
};

/**
 * run_tool 工具 - 运行已创建的工具
 */
export const runToolTool: ToolDef = {
  name: 'run_tool',
  description: '运行 ~/.sanbot/tools/ 目录下的自定义工具',
  schema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: '工具名称',
      },
      args: {
        type: 'string',
        description: '传递给工具的参数（可选）',
      },
      stdin: {
        type: 'string',
        description: '传递给工具的标准输入（可选）',
      },
    },
    required: ['name'],
  },

  async execute(params): Promise<ToolResult> {
    const { name, args = '', stdin } = params;

    const toolPath = join(TOOLS_DIR, name);

    if (!existsSync(toolPath)) {
      return {
        success: false,
        error: `Tool not found: ${name}. Use list_tools to see available tools.`,
      };
    }

    try {
      let result;
      const command = args ? `${toolPath} ${args}` : toolPath;

      if (stdin) {
        result = await $`echo ${stdin} | sh -c ${command}`.quiet();
      } else {
        result = await $`sh -c ${command}`.quiet();
      }

      const stdout = await result.text();

      return {
        success: result.exitCode === 0,
        data: {
          stdout,
          exitCode: result.exitCode,
        },
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        data: {
          stderr: error.stderr?.toString() || '',
          exitCode: error.exitCode || 1,
        },
      };
    }
  },
};
