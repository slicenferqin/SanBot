/**
 * MCP 模块导出
 */

export {
  MCPClient,
  MCPManager,
  type MCPServerConfig,
  type MCPPermissions,
  type MCPTool,
  type MCPToolResult,
} from './client.ts';

export {
  loadMCPConfig,
  saveMCPConfig,
  addMCPServer,
  removeMCPServer,
  addPresetMCPServer,
  listPresets,
  PRESET_MCP_SERVERS,
  type MCPConfig,
} from './config.ts';

export {
  mcpToolToToolDef,
  getMCPToolDefs,
  createBusinessTool,
  BUSINESS_TOOL_TEMPLATES,
  type BusinessToolConfig,
} from './bridge.ts';
