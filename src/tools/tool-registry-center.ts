/**
 * 工具注册中心 - 管理自创建工具的元信息
 */

import { existsSync } from 'fs';
import { readFile, writeFile, mkdir, appendFile, readdir } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';
import { $ } from 'bun';
import type { ToolDef, ToolResult, JsonSchema } from './registry.ts';

export const TOOLS_DIR = join(homedir(), '.sanbot', 'tools');
export const REGISTRY_PATH = join(TOOLS_DIR, 'registry.json');
const TOOL_LOGS_DIR = join(TOOLS_DIR, 'logs');

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
  version: string;
  tags: string[];
  owner: 'agent' | 'user' | 'system';
  lastUsedAt: string | null;
  successCount: number;
  failureCount: number;
  lastError: string | null;
  healthStatus: 'unknown' | 'passing' | 'failing';
  lastValidationAt: string | null;
}

export type ToolMetaInput = Omit<
  ToolMeta,
  'version' | 'tags' | 'owner' | 'lastUsedAt' | 'successCount' | 'failureCount' | 'lastError' | 'healthStatus' | 'lastValidationAt'
> &
  Partial<
    Pick<
      ToolMeta,
      'version' | 'tags' | 'owner' | 'lastUsedAt' | 'successCount' | 'failureCount' | 'lastError' | 'healthStatus' | 'lastValidationAt'
    >
  >;

/**
 * 注册表数据结构
 */
export interface ToolRegistryData {
  version: number;
  tools: Record<string, ToolMeta>;
}

export interface ToolRunLog {
  id: string;
  tool: string;
  timestamp: string;
  durationMs?: number;
  success: boolean;
  params?: Record<string, unknown>;
  stdout?: string;
  stderr?: string;
  error?: string;
}

function normalizeToolMeta(name: string, tool: Partial<ToolMeta>): ToolMeta {
  const now = new Date().toISOString();
  return {
    name: tool.name || name,
    description: tool.description || '',
    language: tool.language === 'bash' ? 'bash' : 'python',
    schema: (tool.schema as JsonSchema) || {
      type: 'object',
      properties: {},
    },
    createdAt: tool.createdAt || now,
    updatedAt: tool.updatedAt || now,
    version: tool.version || '0.1.0',
    tags: Array.isArray(tool.tags) ? tool.tags : [],
    owner: tool.owner || 'agent',
    lastUsedAt: tool.lastUsedAt ?? null,
    successCount: typeof tool.successCount === 'number' ? tool.successCount : 0,
    failureCount: typeof tool.failureCount === 'number' ? tool.failureCount : 0,
    lastError: tool.lastError ?? null,
    healthStatus: tool.healthStatus || 'unknown',
    lastValidationAt: tool.lastValidationAt ?? null,
  };
}

function normalizeRegistry(raw: unknown): ToolRegistryData {
  const parsed = raw as Partial<ToolRegistryData>;
  const toolsObj = parsed?.tools && typeof parsed.tools === 'object' ? parsed.tools : {};
  const normalizedTools: Record<string, ToolMeta> = {};

  for (const [name, meta] of Object.entries(toolsObj)) {
    normalizedTools[name] = normalizeToolMeta(name, meta || {});
  }

  return {
    version: typeof parsed?.version === 'number' ? parsed.version : 2,
    tools: normalizedTools,
  };
}

/**
 * 确保工具目录存在
 */
async function ensureToolsDir(): Promise<void> {
  if (!existsSync(TOOLS_DIR)) {
    await mkdir(TOOLS_DIR, { recursive: true });
  }
  if (!existsSync(TOOL_LOGS_DIR)) {
    await mkdir(TOOL_LOGS_DIR, { recursive: true });
  }
}

/**
 * 加载注册表
 */
export async function loadToolRegistry(): Promise<ToolRegistryData> {
  await ensureToolsDir();

  if (!existsSync(REGISTRY_PATH)) {
    return { version: 2, tools: {} };
  }

  try {
    const content = await readFile(REGISTRY_PATH, 'utf-8');
    return normalizeRegistry(JSON.parse(content));
  } catch {
    return { version: 2, tools: {} };
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
export async function registerTool(meta: ToolMetaInput): Promise<void> {
  const registry = await loadToolRegistry();
  const existing = registry.tools[meta.name];
  const now = new Date().toISOString();

  registry.tools[meta.name] = {
    ...normalizeToolMeta(meta.name, existing || {}),
    ...normalizeToolMeta(meta.name, meta),
    createdAt: existing?.createdAt || meta.createdAt || now,
    updatedAt: meta.updatedAt || now,
    successCount: existing?.successCount ?? meta.successCount ?? 0,
    failureCount: existing?.failureCount ?? meta.failureCount ?? 0,
    lastUsedAt: existing?.lastUsedAt ?? meta.lastUsedAt ?? null,
    lastError: existing?.lastError ?? meta.lastError ?? null,
    healthStatus: meta.healthStatus || existing?.healthStatus || 'unknown',
    lastValidationAt: meta.lastValidationAt || existing?.lastValidationAt || null,
  };

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
 * 更新工具使用统计
 */
export async function updateToolUsage(
  name: string,
  result: { success: boolean; error?: string }
): Promise<void> {
  const registry = await loadToolRegistry();
  const current = registry.tools[name];
  if (!current) return;

  const now = new Date().toISOString();
  current.lastUsedAt = now;
  current.updatedAt = now;
  current.lastValidationAt = now;

  if (result.success) {
    current.successCount += 1;
    current.lastError = null;
    current.healthStatus = 'passing';
  } else {
    current.failureCount += 1;
    current.lastError = result.error || null;
    current.healthStatus = 'failing';
  }

  await saveToolRegistry(registry);
}

function getToolLogPath(name: string): string {
  return join(TOOL_LOGS_DIR, `${name}.jsonl`);
}

export async function appendToolLog(name: string, log: ToolRunLog): Promise<void> {
  await ensureToolsDir();
  const path = getToolLogPath(name);
  await appendFile(path, JSON.stringify(log) + '\n', 'utf-8');
}

export async function getToolLogs(name: string, limit: number = 20): Promise<ToolRunLog[]> {
  await ensureToolsDir();
  const path = getToolLogPath(name);
  if (!existsSync(path)) return [];
  const content = await readFile(path, 'utf-8');
  const lines = content
    .trim()
    .split('\n')
    .filter(Boolean);
  if (lines.length === 0) return [];
  const slice = lines.slice(-limit);
  return slice.map((line) => JSON.parse(line) as ToolRunLog).reverse();
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
        const startedAt = Date.now();
        const result = await $`sh -c ${command}`.quiet();
        const stdout = await result.text();

        const success = result.exitCode === 0;
        await updateToolUsage(meta.name, {
          success,
          error: success ? undefined : `exit code ${result.exitCode}`,
        });

        await appendToolLog(meta.name, {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          tool: meta.name,
          timestamp: new Date().toISOString(),
          durationMs: Date.now() - startedAt,
          success,
          params,
          stdout: stdout.slice(0, 4000),
          error: success ? undefined : `exit code ${result.exitCode}`,
        });

        return {
          success,
          data: {
            stdout: stdout.trim(),
            exitCode: result.exitCode,
          },
        };
      } catch (error: any) {
        await updateToolUsage(meta.name, {
          success: false,
          error: error.message,
        });

        await appendToolLog(meta.name, {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          tool: meta.name,
          timestamp: new Date().toISOString(),
          success: false,
          params,
          stderr: error.stderr?.toString()?.slice(0, 2000),
          error: error.message,
        });

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
