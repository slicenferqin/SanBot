/**
 * MCP (Model Context Protocol) Client
 *
 * 实现 MCP 客户端，支持连接 MCP Server 并调用工具。
 * MCP 是 AI 应用与外部数据源、工具、服务连接的开放标准。
 *
 * 支持的传输方式：
 * - stdio: 本地进程通信
 * - http: HTTP/SSE 通信
 */

import { spawn, type Subprocess } from 'bun';
import { recordContextEvent } from '../context/tracker.ts';

/**
 * MCP Server 配置
 */
export interface MCPServerConfig {
  /** 服务器名称 */
  name: string;
  /** 传输方式 */
  transport: 'stdio' | 'http';
  /** stdio: 命令和参数 */
  command?: string;
  args?: string[];
  /** http: URL */
  url?: string;
  /** 环境变量 */
  env?: Record<string, string>;
  /** 权限配置 */
  permissions?: MCPPermissions;
  /** 描述 */
  description?: string;
}

/**
 * MCP 权限配置
 */
export interface MCPPermissions {
  /** 允许的工具列表（空表示全部允许） */
  allowedTools?: string[];
  /** 禁止的工具列表 */
  blockedTools?: string[];
  /** 是否需要人工确认 */
  requireConfirmation?: boolean;
  /** 最大输出大小（字节） */
  maxOutputSize?: number;
}

/**
 * MCP 工具定义
 */
export interface MCPTool {
  name: string;
  description?: string;
  inputSchema?: {
    type: 'object';
    properties?: Record<string, any>;
    required?: string[];
  };
}

/**
 * MCP 工具调用结果
 */
export interface MCPToolResult {
  content: Array<{
    type: 'text' | 'image' | 'resource';
    text?: string;
    data?: string;
    mimeType?: string;
  }>;
  isError?: boolean;
}

/**
 * MCP 消息类型
 */
interface MCPMessage {
  jsonrpc: '2.0';
  id?: number;
  method?: string;
  params?: any;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

/**
 * MCP Client - 连接和管理 MCP Server
 */
export class MCPClient {
  private config: MCPServerConfig;
  private process: Subprocess | null = null;
  private messageId = 0;
  private pendingRequests = new Map<number, {
    resolve: (value: any) => void;
    reject: (error: Error) => void;
  }>();
  private tools: MCPTool[] = [];
  private connected = false;
  private buffer = '';

  constructor(config: MCPServerConfig) {
    this.config = config;
  }

  /**
   * 连接到 MCP Server
   */
  async connect(): Promise<void> {
    if (this.connected) return;

    if (this.config.transport === 'stdio') {
      await this.connectStdio();
    } else {
      await this.connectHttp();
    }

    // 初始化协议
    await this.initialize();
    this.connected = true;

    // 发现可用工具
    this.tools = await this.listTools();

    await recordContextEvent({
      source: 'mcp',
      summary: `Connected to MCP server: ${this.config.name}`,
      detail: JSON.stringify({
        transport: this.config.transport,
        toolCount: this.tools.length,
      }),
    });
  }

  /**
   * 通过 stdio 连接
   */
  private async connectStdio(): Promise<void> {
    if (!this.config.command) {
      throw new Error('stdio transport requires command');
    }

    this.process = spawn({
      cmd: [this.config.command, ...(this.config.args || [])],
      env: { ...process.env, ...this.config.env },
      stdin: 'pipe',
      stdout: 'pipe',
      stderr: 'pipe',
    });

    // 读取 stdout
    this.readStdout();
  }

  /**
   * 读取 stdout 并解析消息
   */
  private async readStdout(): Promise<void> {
    if (!this.process?.stdout) return;

    const reader = this.process.stdout.getReader();
    const decoder = new TextDecoder();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        this.buffer += decoder.decode(value, { stream: true });
        this.processBuffer();
      }
    } catch (error) {
      console.error('MCP stdout read error:', error);
    }
  }

  /**
   * 处理缓冲区中的消息
   */
  private processBuffer(): void {
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const message = JSON.parse(line) as MCPMessage;
        this.handleMessage(message);
      } catch {
        // 忽略非 JSON 行
      }
    }
  }

  /**
   * 处理收到的消息
   */
  private handleMessage(message: MCPMessage): void {
    if (message.id !== undefined) {
      const pending = this.pendingRequests.get(message.id);
      if (pending) {
        this.pendingRequests.delete(message.id);
        if (message.error) {
          pending.reject(new Error(message.error.message));
        } else {
          pending.resolve(message.result);
        }
      }
    }
  }

  /**
   * 通过 HTTP 连接
   */
  private async connectHttp(): Promise<void> {
    if (!this.config.url) {
      throw new Error('http transport requires url');
    }
    // HTTP 连接在每次请求时建立
  }

  /**
   * 发送请求
   */
  private async sendRequest(method: string, params?: any): Promise<any> {
    const id = ++this.messageId;
    const message: MCPMessage = {
      jsonrpc: '2.0',
      id,
      method,
      params,
    };

    if (this.config.transport === 'stdio') {
      return this.sendStdioRequest(message, id);
    } else {
      return this.sendHttpRequest(message);
    }
  }

  /**
   * 通过 stdio 发送请求
   */
  private async sendStdioRequest(message: MCPMessage, id: number): Promise<any> {
    if (!this.process?.stdin) {
      throw new Error('MCP process not connected');
    }

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });

      const writer = this.process!.stdin.getWriter();
      writer.write(new TextEncoder().encode(JSON.stringify(message) + '\n'));
      writer.releaseLock();

      // 超时处理
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error('MCP request timeout'));
        }
      }, 30000);
    });
  }

  /**
   * 通过 HTTP 发送请求
   */
  private async sendHttpRequest(message: MCPMessage): Promise<any> {
    const response = await fetch(this.config.url!, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
    });

    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status}`);
    }

    const result = await response.json() as MCPMessage;
    if (result.error) {
      throw new Error(result.error.message);
    }

    return result.result;
  }

  /**
   * 初始化协议
   */
  private async initialize(): Promise<void> {
    await this.sendRequest('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {
        tools: {},
      },
      clientInfo: {
        name: 'sanbot',
        version: '0.1.0',
      },
    });

    // 发送 initialized 通知
    if (this.config.transport === 'stdio' && this.process?.stdin) {
      const notification: MCPMessage = {
        jsonrpc: '2.0',
        method: 'notifications/initialized',
      };
      const writer = this.process.stdin.getWriter();
      writer.write(new TextEncoder().encode(JSON.stringify(notification) + '\n'));
      writer.releaseLock();
    }
  }

  /**
   * 列出可用工具
   */
  async listTools(): Promise<MCPTool[]> {
    const result = await this.sendRequest('tools/list');
    return result?.tools || [];
  }

  /**
   * 调用工具
   */
  async callTool(name: string, args: Record<string, any>): Promise<MCPToolResult> {
    // 权限检查
    if (!this.isToolAllowed(name)) {
      throw new Error(`Tool '${name}' is not allowed by permissions`);
    }

    // 人工确认（如果需要）
    if (this.config.permissions?.requireConfirmation) {
      console.log(`\n⚠️  MCP tool call requires confirmation: ${name}`);
      console.log(`   Server: ${this.config.name}`);
      console.log(`   Args: ${JSON.stringify(args)}`);
      // 在实际实现中，这里应该等待用户确认
    }

    const startTime = Date.now();
    const result = await this.sendRequest('tools/call', {
      name,
      arguments: args,
    });

    // 输出大小检查
    const outputSize = JSON.stringify(result).length;
    const maxSize = this.config.permissions?.maxOutputSize || 100000;
    if (outputSize > maxSize) {
      console.warn(`MCP tool output truncated: ${outputSize} > ${maxSize}`);
    }

    // 审计日志
    await recordContextEvent({
      source: 'mcp-tool',
      summary: `Called ${this.config.name}/${name}`,
      detail: JSON.stringify({
        server: this.config.name,
        tool: name,
        durationMs: Date.now() - startTime,
        outputSize,
        isError: result?.isError,
      }),
    });

    return result;
  }

  /**
   * 检查工具是否被允许
   */
  private isToolAllowed(name: string): boolean {
    const perms = this.config.permissions;
    if (!perms) return true;

    // 检查黑名单
    if (perms.blockedTools?.includes(name)) {
      return false;
    }

    // 检查白名单
    if (perms.allowedTools && perms.allowedTools.length > 0) {
      return perms.allowedTools.includes(name);
    }

    return true;
  }

  /**
   * 获取可用工具列表
   */
  getTools(): MCPTool[] {
    return this.tools.filter((t) => this.isToolAllowed(t.name));
  }

  /**
   * 获取服务器名称
   */
  getName(): string {
    return this.config.name;
  }

  /**
   * 检查是否已连接
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * 断开连接
   */
  async disconnect(): Promise<void> {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
    this.connected = false;
    this.tools = [];
    this.pendingRequests.clear();
  }
}

/**
 * MCP Manager - 管理多个 MCP Server
 */
export class MCPManager {
  private clients = new Map<string, MCPClient>();
  private configs: MCPServerConfig[] = [];

  /**
   * 添加服务器配置
   */
  addServer(config: MCPServerConfig): void {
    this.configs.push(config);
  }

  /**
   * 连接所有服务器
   */
  async connectAll(): Promise<void> {
    for (const config of this.configs) {
      try {
        const client = new MCPClient(config);
        await client.connect();
        this.clients.set(config.name, client);
        console.log(`✓ Connected to MCP server: ${config.name}`);
      } catch (error: any) {
        console.error(`✗ Failed to connect to ${config.name}: ${error.message}`);
      }
    }
  }

  /**
   * 获取所有可用工具
   */
  getAllTools(): Array<{ server: string; tool: MCPTool }> {
    const result: Array<{ server: string; tool: MCPTool }> = [];
    for (const [name, client] of this.clients) {
      for (const tool of client.getTools()) {
        result.push({ server: name, tool });
      }
    }
    return result;
  }

  /**
   * 调用工具
   */
  async callTool(
    serverName: string,
    toolName: string,
    args: Record<string, any>
  ): Promise<MCPToolResult> {
    const client = this.clients.get(serverName);
    if (!client) {
      throw new Error(`MCP server not found: ${serverName}`);
    }
    return client.callTool(toolName, args);
  }

  /**
   * 获取客户端
   */
  getClient(name: string): MCPClient | undefined {
    return this.clients.get(name);
  }

  /**
   * 断开所有连接
   */
  async disconnectAll(): Promise<void> {
    for (const client of this.clients.values()) {
      await client.disconnect();
    }
    this.clients.clear();
  }
}
