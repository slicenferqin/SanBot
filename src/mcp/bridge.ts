/**
 * MCP 工具桥接
 *
 * 将 MCP 工具转换为 SanBot 的 ToolDef 格式，
 * 实现 "标准协议 + 业务封装" 双层结构。
 */

import type { ToolDef, ToolResult, JsonSchema } from '../tools/registry.ts';
import type { MCPClient, MCPTool, MCPToolResult } from './client.ts';

/**
 * 将 MCP 工具转换为 ToolDef
 */
export function mcpToolToToolDef(
  client: MCPClient,
  tool: MCPTool
): ToolDef {
  const serverName = client.getName();

  return {
    name: `mcp_${serverName}_${tool.name}`,
    description: `[MCP:${serverName}] ${tool.description || tool.name}`,
    schema: convertSchema(tool.inputSchema),

    async execute(params): Promise<ToolResult> {
      try {
        const result = await client.callTool(tool.name, params);
        return mcpResultToToolResult(result);
      } catch (error: any) {
        return {
          success: false,
          error: error.message,
        };
      }
    },
  };
}

/**
 * 转换 MCP schema 到 JsonSchema
 */
function convertSchema(mcpSchema?: MCPTool['inputSchema']): JsonSchema {
  if (!mcpSchema) {
    return {
      type: 'object',
      properties: {},
    };
  }

  return {
    type: 'object',
    properties: mcpSchema.properties || {},
    required: mcpSchema.required,
  };
}

/**
 * 转换 MCP 结果到 ToolResult
 */
function mcpResultToToolResult(result: MCPToolResult): ToolResult {
  // 提取文本内容
  const textContent = result.content
    .filter((c) => c.type === 'text')
    .map((c) => c.text)
    .join('\n');

  // 检查是否有图片或资源
  const hasMedia = result.content.some(
    (c) => c.type === 'image' || c.type === 'resource'
  );

  return {
    success: !result.isError,
    data: {
      text: textContent,
      hasMedia,
      contentCount: result.content.length,
    },
    error: result.isError ? textContent : undefined,
  };
}

/**
 * 从 MCPClient 获取所有工具的 ToolDef
 */
export function getMCPToolDefs(client: MCPClient): ToolDef[] {
  return client.getTools().map((tool) => mcpToolToToolDef(client, tool));
}

/**
 * 业务工具封装 - 将多个 MCP 工具组合为高层业务工具
 */
export interface BusinessToolConfig {
  name: string;
  description: string;
  schema: JsonSchema;
  /** 执行步骤 */
  steps: Array<{
    /** MCP 服务器名称 */
    server: string;
    /** 工具名称 */
    tool: string;
    /** 参数映射函数 */
    mapParams: (input: any, prevResults: any[]) => any;
    /** 是否可选 */
    optional?: boolean;
  }>;
  /** 结果聚合函数 */
  aggregateResults: (results: any[]) => any;
}

/**
 * 创建业务工具
 */
export function createBusinessTool(
  config: BusinessToolConfig,
  callTool: (server: string, tool: string, args: any) => Promise<MCPToolResult>
): ToolDef {
  return {
    name: config.name,
    description: config.description,
    schema: config.schema,

    async execute(params): Promise<ToolResult> {
      const results: any[] = [];

      try {
        for (const step of config.steps) {
          const stepParams = step.mapParams(params, results);

          try {
            const result = await callTool(step.server, step.tool, stepParams);
            results.push(mcpResultToToolResult(result));
          } catch (error: any) {
            if (step.optional) {
              results.push({ success: false, error: error.message, skipped: true });
            } else {
              throw error;
            }
          }
        }

        const aggregated = config.aggregateResults(results);
        return {
          success: true,
          data: aggregated,
        };
      } catch (error: any) {
        return {
          success: false,
          error: error.message,
          data: { partialResults: results },
        };
      }
    },
  };
}

/**
 * 预定义的业务工具模板
 */
export const BUSINESS_TOOL_TEMPLATES: Record<string, Omit<BusinessToolConfig, 'steps'>> = {
  search_and_read: {
    name: 'search_and_read',
    description: '搜索文件并读取内容',
    schema: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: '搜索模式' },
        maxFiles: { type: 'number', description: '最大文件数' },
      },
      required: ['pattern'],
    },
    aggregateResults: (results) => ({
      searchResult: results[0],
      fileContents: results.slice(1),
    }),
  },

  git_status_and_diff: {
    name: 'git_status_and_diff',
    description: '获取 Git 状态和差异',
    schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '仓库路径' },
      },
    },
    aggregateResults: (results) => ({
      status: results[0],
      diff: results[1],
    }),
  },
};
