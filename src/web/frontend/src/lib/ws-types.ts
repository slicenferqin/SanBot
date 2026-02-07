/**
 * WebSocket message types
 */

// Server -> Client messages
export type ServerMessage =
  | { type: 'system'; message: string }
  | { type: 'user_message'; content: string }
  | { type: 'assistant_start' }
  | { type: 'assistant_delta'; content: string }
  | { type: 'assistant_end'; content: string }
  | { type: 'status'; status: 'idle' | 'thinking' | 'streaming' }
  | { type: 'tool_start'; name: string; args?: Record<string, unknown> }
  | { type: 'tool_end'; name: string; success: boolean; result?: string; error?: string }
  | { type: 'confirm_request'; id: string; command: string; level: string; reasons: string[] }
  | { type: 'chat_history'; messages: HistoryMessage[] }
  | { type: 'llm_config'; providerId: string; model: string; providers: ProviderInfo[]; models: string[]; temperature: number }
  | { type: 'llm_models'; providerId: string; models: string[] }
  | { type: 'llm_update_result'; success: boolean; providerId?: string; model?: string; temperature?: number; error?: string }

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
  toolCalls?: Array<{ name: string; args?: string; result?: string }>
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

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
  toolCalls?: ToolCall[]
  isStreaming?: boolean
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
export interface ContextResponse {
  updatedAt: string
  summary: string | null
  recentConversations: {
    timestamp: string
    userMessage: string
    assistantResponse: string
  }[]
  totalConversations: number
  events: unknown[]
  extracted: unknown
  injection: string
}
