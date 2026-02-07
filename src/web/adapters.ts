/**
 * WebUI 适配器 - 实现 Agent 期望的 StreamWriter 和 ToolSpinner 接口
 * 通过 WebSocket 发送消息到前端
 */

import type { ServerWebSocket } from 'bun';

/**
 * WebSocket 消息类型
 */
export type WebSocketMessage =
  | { type: 'user_message'; content: string }
  | { type: 'assistant_start' }
  | { type: 'assistant_delta'; content: string }
  | { type: 'assistant_end'; content: string }
  | { type: 'tool_start'; id: string; name: string; input: any }
  | { type: 'tool_end'; id: string; status: 'success' | 'error'; message?: string }
  | { type: 'status'; status: string }
  | { type: 'system'; message: string }
  | { type: 'chat_history'; messages: Array<{ timestamp: string; userMessage: string; assistantResponse: string; toolCalls?: Array<{ name: string; args?: string; result?: string }> }> }
  | { type: 'confirm_request'; id: string; command: string; level: string; reasons: string[] }
  | { type: 'llm_config'; providerId: string; model: string; providers: Array<{ id: string; name: string; description?: string; provider: string }>; models: string[]; temperature?: number }
  | { type: 'llm_models'; providerId: string; models: string[] }
  | { type: 'llm_update_result'; success: boolean; error?: string; providerId?: string; model?: string; temperature?: number };

/**
 * WebStreamWriter - 通过 WebSocket 发送流式文本
 * 实现 StreamWriter 接口
 */
export class WebStreamWriter {
  private buffer: string = '';
  private ws: ServerWebSocket<unknown>;
  isTTY: boolean = false;
  useMarkdown: boolean = false;

  constructor(ws: ServerWebSocket<unknown>) {
    this.ws = ws;
  }

  /**
   * 写入流式文本块
   */
  write(chunk: string): void {
    if (!chunk) return;
    this.buffer += chunk;

    const message: WebSocketMessage = {
      type: 'assistant_delta',
      content: chunk,
    };
    this.ws.send(JSON.stringify(message));
  }

  /**
   * 写入完整行
   */
  writeLine(line: string): void {
    this.write(line + '\n');
  }

  /**
   * 写入渲染后的 Markdown
   */
  writeMarkdown(text: string): void {
    this.write(text);
  }

  /**
   * 获取累积的文本
   */
  getBuffer(): string {
    return this.buffer;
  }

  /**
   * 结束流式输出
   */
  end(): void {
    const message: WebSocketMessage = {
      type: 'assistant_end',
      content: this.buffer,
    };
    this.ws.send(JSON.stringify(message));
  }

  /**
   * 停止写入
   */
  stop(): void {
    // WebSocket 不需要特殊处理
  }

  /**
   * 清空缓冲区
   */
  clear(): void {
    this.buffer = '';
  }

  /**
   * 渲染缓冲区中的 Markdown（WebSocket 不需要）
   */
  renderBuffer(): void {
    // WebSocket 模式下不需要重新渲染
  }
}

/**
 * WebToolSpinner - 通过 WebSocket 发送工具调用状态
 */
export class WebToolSpinner {
  private ws: ServerWebSocket<unknown>;
  private toolIdCounter = 0;
  private currentToolId: string | null = null;

  constructor(ws: ServerWebSocket<unknown>) {
    this.ws = ws;
  }

  /**
   * 开始显示工具调用状态
   */
  start(toolName: string, input: any): void {
    this.currentToolId = `tool-${++this.toolIdCounter}`;

    const message: WebSocketMessage = {
      type: 'tool_start',
      id: this.currentToolId,
      name: toolName,
      input,
    };
    this.ws.send(JSON.stringify(message));
  }

  /**
   * 工具调用成功
   */
  success(toolName: string): void {
    if (!this.currentToolId) return;

    const message: WebSocketMessage = {
      type: 'tool_end',
      id: this.currentToolId,
      status: 'success',
    };
    this.ws.send(JSON.stringify(message));
    this.currentToolId = null;
  }

  /**
   * 工具调用失败
   */
  error(toolName: string, errorMsg?: string): void {
    if (!this.currentToolId) return;

    const message: WebSocketMessage = {
      type: 'tool_end',
      id: this.currentToolId,
      status: 'error',
      message: errorMsg,
    };
    this.ws.send(JSON.stringify(message));
    this.currentToolId = null;
  }

  /**
   * 停止 spinner（不显示结果）
   */
  stop(): void {
    // 保留 currentToolId，以便后续可以发送完成状态
    // stop() 只是暂停动画，不清空 toolId
  }

  /**
   * 清空当前 tool ID（用于完全结束工具调用）
   */
  clear(): void {
    this.currentToolId = null;
  }
}
