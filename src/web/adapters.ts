/**
 * WebUI adapters - bridge Agent StreamWriter/ToolSpinner to WebSocket events.
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

export interface WebSocketMessageMeta {
  v: 1;
  seq: number;
  messageId: string;
  sessionId: string | null;
  connectionId: string | null;
  timestamp: string;
}

export interface EnvelopeAwareWebSocketData {
  messageSeq?: number;
  connectionId?: string | null;
  boundSessionId?: string | null;
  requestedSessionId?: string | null;
}

/**
 * WebSocket message types
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

type OutboundWebSocketMessage = WebSocketMessage & { meta?: WebSocketMessageMeta };

function buildMessageMeta(ws: ServerWebSocket<unknown>): WebSocketMessageMeta | null {
  const data = (ws.data ?? null) as EnvelopeAwareWebSocketData | null;
  if (!data || typeof data !== 'object') {
    return null;
  }

  if (typeof data.messageSeq !== 'number' || Number.isNaN(data.messageSeq)) {
    return null;
  }

  data.messageSeq += 1;

  const seq = data.messageSeq;
  const connectionId = typeof data.connectionId === 'string' ? data.connectionId : null;
  const sessionId = typeof data.boundSessionId === 'string'
    ? data.boundSessionId
    : (typeof data.requestedSessionId === 'string' ? data.requestedSessionId : null);

  return {
    v: 1,
    seq,
    messageId: `${connectionId ?? 'ws'}:${seq}`,
    sessionId,
    connectionId,
    timestamp: new Date().toISOString(),
  };
}

export function sendWebSocketMessage(ws: ServerWebSocket<unknown>, message: WebSocketMessage): void {
  const meta = buildMessageMeta(ws);
  const payload: OutboundWebSocketMessage = meta
    ? { ...message, meta }
    : message;

  ws.send(JSON.stringify(payload));
}

/**
 * WebStreamWriter - streams assistant text via WebSocket
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

  write(chunk: string): void {
    if (!chunk) return;
    this.buffer += chunk;

    const message: WebSocketMessage = {
      type: 'assistant_delta',
      content: chunk,
    };
    sendWebSocketMessage(this.ws, message);
  }

  writeLine(line: string): void {
    this.write(line + '\n');
  }

  writeMarkdown(text: string): void {
    this.write(text);
  }

  getBuffer(): string {
    return this.buffer;
  }

  end(): void {
    if (this.ended) return;

    this.ended = true;
    const message: WebSocketMessage = {
      type: 'assistant_end',
      content: this.buffer,
    };
    sendWebSocketMessage(this.ws, message);
  }

  stop(): void {
    // WebSocket transport does not need an explicit stop hook.
  }

  clear(): void {
    this.buffer = '';
    this.ended = false;
  }

  renderBuffer(): void {
    // WebSocket transport does not need a re-render pass.
  }
}

/**
 * WebToolSpinner - sends tool call states via WebSocket
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
    sendWebSocketMessage(this.ws, message);

    this.callbacks.onToolStart?.({
      id: toolId,
      name: toolName,
      input: message.input,
      startedAt: startedAtIso,
    });
  }

  success(toolName: string, meta?: { message?: string; durationMs?: number }): void {
    this.finishTool(toolName, 'success', meta?.message, meta?.durationMs);
  }

  error(toolName: string, errorMsg?: string, meta?: { message?: string; durationMs?: number }): void {
    this.finishTool(toolName, 'error', errorMsg || meta?.message, meta?.durationMs);
  }

  stop(): void {
    // Keep stack for eventual completion signal.
  }

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

    sendWebSocketMessage(this.ws, payload);

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
