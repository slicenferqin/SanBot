import { ToolRegistry } from './registry.ts';
import { execTool } from './exec.ts';
import { readFileTool } from './read-file.ts';
import { writeFileTool } from './write-file.ts';
import { editFileTool } from './edit-file.ts';
import { listDirTool } from './list-dir.ts';
import { createToolTool, listToolsTool, runToolTool } from './self-tool.ts';

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

  // 注册 Self-Tooling 工具
  registry.register(createToolTool);
  registry.register(listToolsTool);
  registry.register(runToolTool);

  return registry;
}

// 导出所有工具
export { execTool, readFileTool, writeFileTool, editFileTool, listDirTool };
export { createToolTool, listToolsTool, runToolTool };
export { ToolRegistry } from './registry.ts';
export type { ToolDef, ToolResult } from './registry.ts';
