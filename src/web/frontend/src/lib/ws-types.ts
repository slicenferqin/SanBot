/**
 * WebSocket message types
 */

export type ToolRunStatus = 'success' | 'error'

// Server -> Client messages
export type ServerMessage =
  | { type: 'system'; message: string }
  | { type: 'user_message'; content: string }
  | { type: 'assistant_start' }
  | { type: 'assistant_delta'; content: string }
  | { type: 'assistant_end'; content: string }
  | { type: 'status'; status: 'idle' | 'thinking' | 'streaming' }
  | { type: 'tool_start'; id: string; name: string; input: unknown; startedAt: string }
  | {
      type: 'tool_end'
      id: string
      name: string
      status: ToolRunStatus
      message?: string
      endedAt: string
      durationMs: number
    }
  | {
      type: 'turn_summary'
      startedAt: string
      endedAt: string
      durationMs: number
      tools: {
        total: number
        success: number
        error: number
      }
      stopped?: boolean
    }
  | { type: 'confirm_request'; id: string; command: string; level: string; reasons: string[] }
  | { type: 'chat_history'; messages: HistoryMessage[] }
  | { type: 'session_bound'; sessionId: string }
  | {
      type: 'llm_config'
      providerId: string
      model: string
      providers: ProviderInfo[]
      models: string[]
      temperature: number
    }
  | { type: 'llm_models'; providerId: string; models: string[] }
  | {
      type: 'llm_update_result'
      success: boolean
      providerId?: string
      model?: string
      temperature?: number
      error?: string
    }

// Client -> Server messages
export type ClientMessage =
  | { type: 'chat'; content: string }
  | { type: 'command'; command: string }
  | { type: 'confirm_response'; confirmed: boolean; confirmId: string }
  | { type: 'stop_request'; messageId: string }
  | { type: 'llm_get_providers' }
  | { type: 'llm_get_models'; providerId: string }
  | { type: 'llm_update'; providerId: string; model: string; temperature?: number }

// History message from server
export interface HistoryMessage {
  timestamp: string
  userMessage: string
  assistantResponse: string
  toolCalls?: Array<{ name: string; args?: string; result?: string; success?: boolean }>
}

// Provider info
export interface ProviderInfo {
  id: string
  name: string
  description: string
  provider: string
}

// Chat message types
export interface ToolCall {
  id: string
  name: string
  args?: Record<string, unknown>
  status: 'running' | 'success' | 'error'
  result?: string
  error?: string
}

export interface ToolEventPayload {
  kind: 'tool_event'
  toolId: string
  name: string
  status: 'running' | 'success' | 'error'
  startedAt: string
  endedAt?: string
  durationMs?: number
  input?: unknown
  message?: string
}

export interface TurnSummaryPayload {
  kind: 'turn_summary'
  startedAt: string
  endedAt: string
  durationMs: number
  tools: {
    total: number
    success: number
    error: number
  }
  stopped?: boolean
}

export type EventPayload = ToolEventPayload | TurnSummaryPayload

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system' | 'event'
  content: string
  timestamp: number
  toolCalls?: ToolCall[]
  isStreaming?: boolean
  event?: EventPayload
}

// Confirmation request
export interface ConfirmationRequest {
  id: string
  command: string
  level: string
  reasons: string[]
}

// Audit log types
export interface AuditEntry {
  timestamp: string
  dangerLevel: 'safe' | 'warning' | 'danger' | 'critical'
  action: 'approved' | 'rejected' | 'auto_blocked'
  command: string
  reasons?: string[]
  executionResult?: {
    success: boolean
    exitCode?: number
    error?: string
  }
}

export interface AuditResponse {
  date: string
  stats: AuditStats
  filteredStats: AuditStats
  logs: AuditEntry[]
  pagination: {
    page: number
    pageSize: number
    total: number
    totalPages: number
  }
  filters: {
    level: string | null
    action: string | null
    limit: number
  }
}

export interface AuditStats {
  total: number
  approved: number
  rejected: number
  autoBlocked: number
  byLevel: {
    safe: number
    warning: number
    danger: number
    critical: number
  }
}

// Tool types
export interface ToolMeta {
  name: string
  description: string
  tags: string[]
  createdAt: string
  updatedAt: string
  lastUsedAt?: string
  usageCount: number
}

export interface ToolsResponse {
  tools: ToolMeta[]
  pagination: {
    page: number
    pageSize: number
    total: number
    totalPages: number
  }
  filters: {
    q: string | null
    tag: string | null
  }
}

export interface ToolLog {
  timestamp: string
  args: string
  success: boolean
  exitCode?: number
  error?: string
}

// Context types
export interface ContextSessionSummary {
  sessionId: string | null
  conversationCount: number
  lastActivityAt: string | null
}

export interface ContextEvent {
  timestamp: string
  source: string
  summary: string
  detail?: string
  sessionId?: string
}

export interface ContextExtracted {
  runtime?: string[]
  decisions?: string[]
  facts?: string[]
  preferences?: string[]
}

export interface ContextResponse {
  updatedAt: string
  summary: string | null
  session: ContextSessionSummary
  recentConversations: {
    timestamp: string
    userMessage: string
    assistantResponse: string
  }[]
  totalConversations: number
  events: ContextEvent[]
  extracted: ContextExtracted | null
  injection: string
}

// Session list types
export interface SessionLLMConfig {
  providerId: string
  model: string
  temperature: number
  updatedAt: string
}

export interface SessionDigest {
  sessionId: string
  title: string
  startedAt: string
  lastActivityAt: string
  turns: number
  preview: string
  llm?: SessionLLMConfig | null
}

export interface SessionsResponse {
  sessions: SessionDigest[]
}
