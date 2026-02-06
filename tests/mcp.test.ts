/**
 * MCP 模块单元测试
 */

import { describe, test, expect } from 'bun:test';
import {
  mcpToolToToolDef,
  createBusinessTool,
  BUSINESS_TOOL_TEMPLATES,
  type BusinessToolConfig,
} from '../src/mcp/bridge.ts';
import {
  listPresets,
  PRESET_MCP_SERVERS,
} from '../src/mcp/config.ts';
import type { MCPTool, MCPToolResult } from '../src/mcp/client.ts';

// Mock MCPClient for testing
class MockMCPClient {
  private name: string;
  private tools: MCPTool[];

  constructor(name: string, tools: MCPTool[]) {
    this.name = name;
    this.tools = tools;
  }

  getName(): string {
    return this.name;
  }

  getTools(): MCPTool[] {
    return this.tools;
  }

  async callTool(name: string, args: any): Promise<MCPToolResult> {
    return {
      content: [{ type: 'text', text: `Called ${name} with ${JSON.stringify(args)}` }],
    };
  }
}

describe('MCP Bridge', () => {
  describe('mcpToolToToolDef', () => {
    test('converts MCP tool to ToolDef', () => {
      const client = new MockMCPClient('test-server', []);
      const mcpTool: MCPTool = {
        name: 'read_file',
        description: 'Read a file',
        inputSchema: {
          type: 'object',
          properties: {
            path: { type: 'string' },
          },
          required: ['path'],
        },
      };

      const toolDef = mcpToolToToolDef(client as any, mcpTool);

      expect(toolDef.name).toBe('mcp_test-server_read_file');
      expect(toolDef.description).toContain('[MCP:test-server]');
      expect(toolDef.description).toContain('Read a file');
      expect(toolDef.schema.properties).toHaveProperty('path');
      expect(toolDef.schema.required).toContain('path');
    });

    test('handles tool without schema', () => {
      const client = new MockMCPClient('server', []);
      const mcpTool: MCPTool = {
        name: 'simple_tool',
      };

      const toolDef = mcpToolToToolDef(client as any, mcpTool);

      expect(toolDef.name).toBe('mcp_server_simple_tool');
      expect(toolDef.schema.type).toBe('object');
      expect(toolDef.schema.properties).toEqual({});
    });

    test('execute calls client.callTool', async () => {
      const client = new MockMCPClient('server', []);
      const mcpTool: MCPTool = {
        name: 'test_tool',
      };

      const toolDef = mcpToolToToolDef(client as any, mcpTool);
      const result = await toolDef.execute({ arg1: 'value1' });

      expect(result.success).toBe(true);
      expect(result.data?.text).toContain('Called test_tool');
    });
  });

  describe('createBusinessTool', () => {
    test('creates business tool with multiple steps', async () => {
      const mockCallTool = async (server: string, tool: string, args: any): Promise<MCPToolResult> => {
        return {
          content: [{ type: 'text', text: `${server}/${tool}: ${JSON.stringify(args)}` }],
        };
      };

      const config: BusinessToolConfig = {
        name: 'test_business_tool',
        description: 'Test business tool',
        schema: {
          type: 'object',
          properties: {
            input: { type: 'string' },
          },
        },
        steps: [
          {
            server: 'server1',
            tool: 'tool1',
            mapParams: (input) => ({ param: input.input }),
          },
          {
            server: 'server2',
            tool: 'tool2',
            mapParams: (input, prev) => ({ prevResult: prev[0]?.data?.text }),
          },
        ],
        aggregateResults: (results) => ({
          step1: results[0],
          step2: results[1],
        }),
      };

      const tool = createBusinessTool(config, mockCallTool);

      expect(tool.name).toBe('test_business_tool');

      const result = await tool.execute({ input: 'test' });
      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('step1');
      expect(result.data).toHaveProperty('step2');
    });

    test('handles optional step failure', async () => {
      const mockCallTool = async (server: string, tool: string, args: any): Promise<MCPToolResult> => {
        if (tool === 'failing_tool') {
          throw new Error('Tool failed');
        }
        return {
          content: [{ type: 'text', text: 'success' }],
        };
      };

      const config: BusinessToolConfig = {
        name: 'test_optional',
        description: 'Test optional step',
        schema: { type: 'object', properties: {} },
        steps: [
          {
            server: 's1',
            tool: 'working_tool',
            mapParams: () => ({}),
          },
          {
            server: 's2',
            tool: 'failing_tool',
            mapParams: () => ({}),
            optional: true,
          },
          {
            server: 's3',
            tool: 'another_working',
            mapParams: () => ({}),
          },
        ],
        aggregateResults: (results) => results,
      };

      const tool = createBusinessTool(config, mockCallTool);
      const result = await tool.execute({});

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(3);
      expect(result.data[1].skipped).toBe(true);
    });
  });

  describe('BUSINESS_TOOL_TEMPLATES', () => {
    test('has search_and_read template', () => {
      expect(BUSINESS_TOOL_TEMPLATES).toHaveProperty('search_and_read');
      expect(BUSINESS_TOOL_TEMPLATES.search_and_read.name).toBe('search_and_read');
    });

    test('has git_status_and_diff template', () => {
      expect(BUSINESS_TOOL_TEMPLATES).toHaveProperty('git_status_and_diff');
      expect(BUSINESS_TOOL_TEMPLATES.git_status_and_diff.name).toBe('git_status_and_diff');
    });
  });
});

describe('MCP Config', () => {
  describe('listPresets', () => {
    test('returns available presets', () => {
      const presets = listPresets();
      expect(presets.length).toBeGreaterThan(0);
      expect(presets.some((p) => p.name === 'filesystem')).toBe(true);
      expect(presets.some((p) => p.name === 'github')).toBe(true);
    });
  });

  describe('PRESET_MCP_SERVERS', () => {
    test('filesystem preset has correct config', () => {
      const fs = PRESET_MCP_SERVERS.filesystem;
      expect(fs.transport).toBe('stdio');
      expect(fs.command).toBe('npx');
      expect(fs.permissions?.requireConfirmation).toBe(true);
    });

    test('github preset has correct config', () => {
      const gh = PRESET_MCP_SERVERS.github;
      expect(gh.transport).toBe('stdio');
      expect(gh.permissions?.requireConfirmation).toBe(true);
    });

    test('all presets have description', () => {
      for (const [name, config] of Object.entries(PRESET_MCP_SERVERS)) {
        expect(config.description).toBeTruthy();
      }
    });
  });
});
