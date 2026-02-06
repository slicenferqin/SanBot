import { ToolRegistry } from './registry.ts';
import { execTool } from './exec.ts';
import { readFileTool } from './read-file.ts';
import { writeFileTool } from './write-file.ts';
import { editFileTool } from './edit-file.ts';
import { listDirTool } from './list-dir.ts';
import { createToolTool, listToolsTool, runToolTool } from './self-tool.ts';
import { getDynamicTools } from './tool-registry-center.ts';
import { getBusinessTools } from './business.ts';

/**
 * 创建并注册所有内置工具
 */
export function createToolRegistry(): ToolRegistry {
  const registry = new ToolRegistry();

  // 注册内置工具
  registry.register(execTool);
  registry.register(readFileTool);
  registry.register(writeFileTool);
  registry.register(editFileTool);
  registry.register(listDirTool);

  // 注册 Self-Tooling 管理工具
  registry.register(createToolTool);
  registry.register(listToolsTool);
  registry.register(runToolTool);

  // 注册业务工具
  for (const tool of getBusinessTools()) {
    registry.register(tool);
  }

  return registry;
}

/**
 * 创建工具注册表并加载自创建工具
 */
export async function createToolRegistryWithDynamic(): Promise<ToolRegistry> {
  const registry = createToolRegistry();

  // 加载自创建工具
  const dynamicTools = await getDynamicTools();
  for (const tool of dynamicTools) {
    registry.register(tool);
  }

  console.log(`📦 Loaded ${dynamicTools.length} custom tools from registry`);

  return registry;
}

// 导出所有工具
export { execTool, readFileTool, writeFileTool, editFileTool, listDirTool };
export { createToolTool, listToolsTool, runToolTool };
export { getBusinessTools } from './business.ts';
export { ToolRegistry } from './registry.ts';
export type { ToolDef, ToolResult } from './registry.ts';
export { getDynamicTools, loadToolRegistry } from './tool-registry-center.ts';
