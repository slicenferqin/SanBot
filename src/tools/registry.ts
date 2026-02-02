/**
 * 工具执行结果
 */
export interface ToolResult {
  success: boolean;
  data?: any;
  error?: string;
}

/**
 * JSON Schema 定义
 */
export interface JsonSchema {
  type: 'object';
  properties: Record<string, any>;
  required?: string[];
}

/**
 * 工具定义
 */
export interface ToolDef {
  name: string;
  description: string;
  schema: JsonSchema;
  execute: (params: any) => Promise<ToolResult>;
}

/**
 * 工具注册表
 */
export class ToolRegistry {
  private tools = new Map<string, ToolDef>();

  register(toolDef: ToolDef): void {
    this.tools.set(toolDef.name, toolDef);
  }

  get(name: string): ToolDef | undefined {
    return this.tools.get(name);
  }

  getAll(): ToolDef[] {
    return Array.from(this.tools.values());
  }
}
