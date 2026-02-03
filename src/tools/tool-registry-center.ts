/**
 * 工具注册中心 - 管理自创建工具的元信息
 */

import { existsSync } from 'fs';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';
import { $ } from 'bun';
import type { ToolDef, ToolResult, JsonSchema } from './registry.ts';

export const TOOLS_DIR = join(homedir(), '.sanbot', 'tools');
export const REGISTRY_PATH = join(TOOLS_DIR, 'registry.json');

/**
 * 工具元信息
 */
export interface ToolMeta {
  name: string;
  description: string;
  language: 'python' | 'bash';
  schema: JsonSchema;
  createdAt: string;
  updatedAt: string;
}

/**
 * 注册表数据结构
 */
export interface ToolRegistryData {
  version: number;
  tools: Record<string, ToolMeta>;
}

/**
 * 确保工具目录存在
 */
async function ensureToolsDir(): Promise<void> {
  if (!existsSync(TOOLS_DIR)) {
    await mkdir(TOOLS_DIR, { recursive: true });
  }
}

/**
 * 加载注册表
 */
export async function loadToolRegistry(): Promise<ToolRegistryData> {
  await ensureToolsDir();

  if (!existsSync(REGISTRY_PATH)) {
    return { version: 1, tools: {} };
  }

  try {
    const content = await readFile(REGISTRY_PATH, 'utf-8');
    return JSON.parse(content);
  } catch {
    return { version: 1, tools: {} };
  }
}

/**
 * 保存注册表
 */
async function saveToolRegistry(data: ToolRegistryData): Promise<void> {
  await ensureToolsDir();
  await writeFile(REGISTRY_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

/**
 * 注册工具
 */
export async function registerTool(meta: ToolMeta): Promise<void> {
  const registry = await loadToolRegistry();
  registry.tools[meta.name] = meta;
  await saveToolRegistry(registry);
}

/**
 * 获取工具元信息
 */
export async function getToolMeta(name: string): Promise<ToolMeta | null> {
  const registry = await loadToolRegistry();
  return registry.tools[name] || null;
}

/**
 * 删除工具注册
 */
export async function unregisterTool(name: string): Promise<void> {
  const registry = await loadToolRegistry();
  delete registry.tools[name];
  await saveToolRegistry(registry);
}

/**
 * 将自创建工具转换为 ToolDef（供 Agent 使用）
 */
export function createDynamicToolDef(meta: ToolMeta): ToolDef {
  const toolPath = join(TOOLS_DIR, meta.name);

  return {
    name: meta.name,
    description: `[自创建工具] ${meta.description}`,
    schema: meta.schema,

    async execute(params): Promise<ToolResult> {
      if (!existsSync(toolPath)) {
        return {
          success: false,
          error: `Tool script not found: ${toolPath}`,
        };
      }

      try {
        // 构建命令行参数
        const args = Object.entries(params)
          .map(([key, value]) => {
            if (typeof value === 'boolean') {
              return value ? `--${key}` : '';
            }
            return `--${key}="${value}"`;
          })
          .filter(Boolean)
          .join(' ');

        const command = args ? `${toolPath} ${args}` : toolPath;
        const result = await $`sh -c ${command}`.quiet();
        const stdout = await result.text();

        return {
          success: result.exitCode === 0,
          data: {
            stdout: stdout.trim(),
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
}

/**
 * 获取所有自创建工具的 ToolDef
 */
export async function getDynamicTools(): Promise<ToolDef[]> {
  const registry = await loadToolRegistry();
  return Object.values(registry.tools).map(createDynamicToolDef);
}
