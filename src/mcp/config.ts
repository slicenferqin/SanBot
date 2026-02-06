/**
 * MCP 配置加载器
 *
 * 从配置文件加载 MCP Server 配置
 */

import { existsSync } from 'fs';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';
import type { MCPServerConfig, MCPPermissions } from './client.ts';

const CONFIG_DIR = join(homedir(), '.sanbot');
const MCP_CONFIG_PATH = join(CONFIG_DIR, 'mcp.json');

/**
 * MCP 配置文件结构
 */
export interface MCPConfig {
  version: number;
  servers: MCPServerConfig[];
  globalPermissions?: MCPPermissions;
}

/**
 * 默认配置
 */
const DEFAULT_CONFIG: MCPConfig = {
  version: 1,
  servers: [],
  globalPermissions: {
    maxOutputSize: 100000,
    requireConfirmation: false,
  },
};

/**
 * 预设的 MCP Server 配置
 */
export const PRESET_MCP_SERVERS: Record<string, Omit<MCPServerConfig, 'name'>> = {
  filesystem: {
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem', '/'],
    description: 'File system access via MCP',
    permissions: {
      requireConfirmation: true,
    },
  },
  github: {
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-github'],
    description: 'GitHub API access via MCP',
    permissions: {
      requireConfirmation: true,
    },
  },
  sqlite: {
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-sqlite'],
    description: 'SQLite database access via MCP',
  },
  memory: {
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-memory'],
    description: 'Knowledge graph memory via MCP',
  },
};

/**
 * 确保配置目录存在
 */
async function ensureConfigDir(): Promise<void> {
  if (!existsSync(CONFIG_DIR)) {
    await mkdir(CONFIG_DIR, { recursive: true });
  }
}

/**
 * 加载 MCP 配置
 */
export async function loadMCPConfig(): Promise<MCPConfig> {
  await ensureConfigDir();

  if (!existsSync(MCP_CONFIG_PATH)) {
    return DEFAULT_CONFIG;
  }

  try {
    const content = await readFile(MCP_CONFIG_PATH, 'utf-8');
    const config = JSON.parse(content) as MCPConfig;
    return {
      ...DEFAULT_CONFIG,
      ...config,
    };
  } catch {
    return DEFAULT_CONFIG;
  }
}

/**
 * 保存 MCP 配置
 */
export async function saveMCPConfig(config: MCPConfig): Promise<void> {
  await ensureConfigDir();
  await writeFile(MCP_CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
}

/**
 * 添加 MCP Server 到配置
 */
export async function addMCPServer(server: MCPServerConfig): Promise<void> {
  const config = await loadMCPConfig();

  // 检查是否已存在
  const existingIndex = config.servers.findIndex((s) => s.name === server.name);
  if (existingIndex >= 0) {
    config.servers[existingIndex] = server;
  } else {
    config.servers.push(server);
  }

  await saveMCPConfig(config);
}

/**
 * 移除 MCP Server
 */
export async function removeMCPServer(name: string): Promise<void> {
  const config = await loadMCPConfig();
  config.servers = config.servers.filter((s) => s.name !== name);
  await saveMCPConfig(config);
}

/**
 * 从预设添加 MCP Server
 */
export async function addPresetMCPServer(
  presetName: string,
  customName?: string
): Promise<void> {
  const preset = PRESET_MCP_SERVERS[presetName];
  if (!preset) {
    throw new Error(`Unknown preset: ${presetName}`);
  }

  const server: MCPServerConfig = {
    name: customName || presetName,
    ...preset,
  };

  await addMCPServer(server);
}

/**
 * 列出可用的预设
 */
export function listPresets(): Array<{ name: string; description: string }> {
  return Object.entries(PRESET_MCP_SERVERS).map(([name, config]) => ({
    name,
    description: config.description || '',
  }));
}
