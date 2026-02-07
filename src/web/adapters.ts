/**
 * WebUI 适配器 - 实现 Agent 期望的 StreamWriter 和 ToolSpinner 接口
 * 通过 WebSocket 发送消息到前端
 */

import type { ServerWebSocket } from 'bun';
import { redactSensitiveValue, redactSensitiveText } from '../utils/redaction.ts';

export interface ToolStartEvent {
  id: string;
  name: string;
  input: unknown;
  startedAt: string;
}

export interface ToolEndEvent {
  id: string;
  name: string;
  status: 'success' | 'error';
  message?: string;
  endedAt: string;
  durationMs: number;
}

interface WebToolSpinnerCallbacks {
  onToolStart?: (event: ToolStartEvent) => void;
  onToolEnd?: (event: ToolEndEvent) => void;
}

/**
 * WebSocket 消息类型
 */
export type WebSocketMessage =
  | { type: 'user_message'; content: string }
  | { type: 'assistant_start' }
  | { type: 'assistant_delta'; content: string }
  | { type: 'assistant_end'; content: string }
  | ToolStartWsMessage
  | ToolEndWsMessage
  | TurnSummaryWsMessage
  | { type: 'status'; status: string }
  | { type: 'system'; message: string }
  | {
      type: 'chat_history';
      messages: Array<{
        timestamp: string;
        userMessage: string;
        assistantResponse: string;
        toolCalls?: Array<{ name: string; args?: string; result?: string; success?: boolean }>;
      }>;
    }
  | { type: 'confirm_request'; id: string; command: string; level: string; reasons: string[] }
  | {
      type: 'llm_config';
      providerId: string;
      model: string;
      providers: Array<{ id: string; name: string; description?: string; provider: string }>;
      models: string[];
      temperature?: number;
    }
  | { type: 'llm_models'; providerId: string; models: string[] }
  | { type: 'session_bound'; sessionId: string }
  | {
      type: 'llm_update_result';
      success: boolean;
      error?: string;
      providerId?: string;
      model?: string;
      temperature?: number;
    };

export type ToolStartWsMessage = {
  type: 'tool_start';
  id: string;
  name: string;
  input: unknown;
  startedAt: string;
};

export type ToolEndWsMessage = {
  type: 'tool_end';
  id: string;
  name: string;
  status: 'success' | 'error';
  message?: string;
  endedAt: string;
  durationMs: number;
};

export type TurnSummaryWsMessage = {
  type: 'turn_summary';
  startedAt: string;
  endedAt: string;
  durationMs: number;
  tools: {
    total: number;
    success: number;
    error: number;
  };
  stopped?: boolean;
};

/**
 * WebStreamWriter - 通过 WebSocket 发送流式文本
 * 实现 StreamWriter 接口
 */
export class WebStreamWriter {
  private buffer: string = '';
  private ws: ServerWebSocket<unknown>;
  private ended = false;
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
    if (this.ended) return;

    this.ended = true;
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
    this.ended = false;
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
  private activeToolStack: string[] = [];
  private runningTools = new Map<
    string,
    {
      name: string;
      startedAtMs: number;
      startedAtIso: string;
    }
  >();
  private callbacks: WebToolSpinnerCallbacks;

  constructor(ws: ServerWebSocket<unknown>, callbacks: WebToolSpinnerCallbacks = {}) {
    this.ws = ws;
    this.callbacks = callbacks;
  }

  /**
   * 开始显示工具调用状态
   */
  start(toolName: string, input: unknown): void {
    const toolId = `tool-${++this.toolIdCounter}`;
    const startedAtMs = Date.now();
    const startedAtIso = new Date(startedAtMs).toISOString();

    this.activeToolStack.push(toolId);
    this.runningTools.set(toolId, {
      name: toolName,
      startedAtMs,
      startedAtIso,
    });

    const message: ToolStartWsMessage = {
      type: 'tool_start',
      id: toolId,
      name: toolName,
      input: redactSensitiveValue(input),
      startedAt: startedAtIso,
    };
    this.ws.send(JSON.stringify(message));

    this.callbacks.onToolStart?.({
      id: toolId,
      name: toolName,
      input: message.input,
      startedAt: startedAtIso,
    });
  }

  /**
   * 工具调用成功
   */
  success(toolName: string, meta?: { message?: string; durationMs?: number }): void {
    this.finishTool(toolName, 'success', meta?.message, meta?.durationMs);
  }

  /**
   * 工具调用失败
   */
  error(toolName: string, errorMsg?: string, meta?: { message?: string; durationMs?: number }): void {
    this.finishTool(toolName, 'error', errorMsg || meta?.message, meta?.durationMs);
  }

  /**
   * 停止 spinner（不显示结果）
   */
  stop(): void {
    // 保留 activeToolStack，以便后续可以发送完成状态
    // stop() 只是暂停动画，不清空工具调用
  }

  /**
   * 清空当前工具调用状态（用于完全结束工具调用）
   */
  clear(): void {
    this.activeToolStack = [];
    this.runningTools.clear();
  }

  private finishTool(
    toolName: string,
    status: 'success' | 'error',
    message?: string,
    durationMsHint?: number,
  ): void {
    const toolId = this.activeToolStack.pop();
    if (!toolId) return;

    const runningInfo = this.runningTools.get(toolId);
    this.runningTools.delete(toolId);

    const endedAtMs = Date.now();
    const endedAt = new Date(endedAtMs).toISOString();
    const durationMs = typeof durationMsHint === 'number' && durationMsHint >= 0
      ? Math.floor(durationMsHint)
      : Math.max(0, endedAtMs - (runningInfo?.startedAtMs ?? endedAtMs));

    const payload: ToolEndWsMessage = {
      type: 'tool_end',
      id: toolId,
      name: runningInfo?.name ?? toolName,
      status,
      message: message ? redactSensitiveText(message) : undefined,
      endedAt,
      durationMs,
    };

    this.ws.send(JSON.stringify(payload));

    this.callbacks.onToolEnd?.({
      id: toolId,
      name: payload.name,
      status,
      message: payload.message,
      endedAt,
      durationMs,
    });
  }
}
