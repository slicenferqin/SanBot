/**
 * TUI-PI 类型定义
 * 基于 pi-tui 的 SanBot TUI 实现
 */

/**
 * 消息角色
 */
export type MessageRole = 'user' | 'assistant' | 'system';

/**
 * 消息内容块
 */
export interface MessageBlock {
  type: 'text' | 'thinking';
  text: string;
}

/**
 * 聊天消息
 */
export interface ChatMessage {
  role: MessageRole;
  content: string;
  timestamp: Date;
  thinking?: string; // 思考过程（可选）
}

/**
 * 工具调用状态
 */
export type ToolStatus = 'pending' | 'success' | 'error';

/**
 * 工具调用记录
 */
export interface ToolCall {
  id: string;
  name: string;
  input: any;
  status: ToolStatus;
  result?: string;
  error?: string;
  startTime: Date;
  endTime?: Date;
}

/**
 * 流式文本组装器状态
 */
export interface StreamState {
  text: string;
  thinking: string;
  lastUpdate: Date;
}

/**
 * TUI 配置
 */
export interface TUIConfig {
  sessionId: string;
  model: string;
  showThinking?: boolean; // 是否显示思考过程
  maxToolsDisplay?: number; // 最多显示多少个工具调用
}

/**
 * TUI 状态
 */
export interface TUIState {
  messages: ChatMessage[];
  currentStream: StreamState | null;
  toolCalls: ToolCall[];
  isStreaming: boolean;
  status: string;
}
