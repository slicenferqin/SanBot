import { create } from 'zustand'
import type {
  ChatMessage,
  ConfirmationRequest,
  HistoryMessage,
  ToolEventPayload,
  TurnSummaryPayload,
} from '@/lib/ws-types'
import { generateId } from '@/lib/format'

function parseTimestamp(value: string | undefined): number {
  if (!value) return Date.now()
  const ts = new Date(value).getTime()
  return Number.isFinite(ts) ? ts : Date.now()
}

function formatDuration(durationMs: number): string {
  if (durationMs < 1000) return `${Math.max(0, Math.round(durationMs))}ms`

  const totalSeconds = Math.round(durationMs / 1000)
  if (totalSeconds < 60) return `${totalSeconds}s`

  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  if (minutes < 60) return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`

  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`
}

function summarizeInput(input: unknown): string {
  if (input == null) return ''

  if (typeof input === 'string') {
    return input.length > 80 ? `${input.slice(0, 77)}...` : input
  }

  try {
    const serialized = JSON.stringify(input)
    if (!serialized) return ''
    return serialized.length > 120 ? `${serialized.slice(0, 117)}...` : serialized
  } catch {
    const fallback = String(input)
    return fallback.length > 120 ? `${fallback.slice(0, 117)}...` : fallback
  }
}

function formatToolEventContent(event: ToolEventPayload): string {
  const inputSummary = summarizeInput(event.input)
  const command = inputSummary ? `Ran ${event.name} ${inputSummary}` : `Ran ${event.name}`

  if (event.status === 'running') {
    return command
  }

  if (event.status === 'error') {
    if (typeof event.durationMs === 'number') {
      return `${command} (failed in ${formatDuration(event.durationMs)})`
    }
    return `${command} (failed)`
  }

  if (typeof event.durationMs === 'number') {
    return `${command} (${formatDuration(event.durationMs)})`
  }
  return command
}

function formatTurnSummaryContent(summary: TurnSummaryPayload): string {
  const base = `Worked for ${formatDuration(summary.durationMs)} · Tools ${summary.tools.total} (${summary.tools.success}✓ ${summary.tools.error}✗)`
  if (summary.stopped) {
    return `${base} · Stopped`
  }
  return base
}

interface ToolStartInput {
  id: string
  name: string
  input: unknown
  startedAt: string
}

interface ToolEndInput {
  id: string
  name: string
  status: 'success' | 'error'
  message?: string
  endedAt: string
  durationMs: number
}

interface TurnSummaryInput {
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

interface ChatState {
  messages: ChatMessage[]
  isStreaming: boolean
  pendingConfirmation: ConfirmationRequest | null
  currentAssistantId: string | null

  addUserMessage: (content: string) => void
  addSystemMessage: (content: string) => void
  startAssistant: () => string
  appendDelta: (content: string) => void
  endAssistant: (content: string) => void
  addToolStart: (payload: ToolStartInput) => void
  updateToolEnd: (payload: ToolEndInput) => void
  addTurnSummary: (payload: TurnSummaryInput) => void
  setConfirmation: (confirmation: ConfirmationRequest | null) => void
  loadHistory: (history: HistoryMessage[]) => void
  clearMessages: () => void
}

export const useChatStore = create<ChatState>((set) => ({
  messages: [],
  isStreaming: false,
  pendingConfirmation: null,
  currentAssistantId: null,

  addUserMessage: (content) => {
    const message: ChatMessage = {
      id: generateId(),
      role: 'user',
      content,
      timestamp: Date.now(),
    }
    set((state) => ({ messages: [...state.messages, message] }))
  },

  addSystemMessage: (content) => {
    const message: ChatMessage = {
      id: generateId(),
      role: 'system',
      content,
      timestamp: Date.now(),
    }
    set((state) => ({ messages: [...state.messages, message] }))
  },

  startAssistant: () => {
    const id = generateId()
    set({
      isStreaming: true,
      currentAssistantId: id,
    })
    return id
  },

  appendDelta: (content) => {
    set((state) => {
      const messages = [...state.messages]
      const assistantId = state.currentAssistantId

      let targetIndex = assistantId
        ? messages.findIndex((message) => message.id === assistantId)
        : -1

      if (targetIndex === -1) {
        for (let i = messages.length - 1; i >= 0; i -= 1) {
          const message = messages[i]
          if (message?.role === 'assistant' && message.isStreaming) {
            targetIndex = i
            break
          }
        }
      }

      let nextAssistantId = assistantId

      if (targetIndex === -1) {
        const fallbackId = assistantId ?? generateId()
        messages.push({
          id: fallbackId,
          role: 'assistant',
          content: '',
          timestamp: Date.now(),
          toolCalls: [],
          isStreaming: true,
        })
        targetIndex = messages.length - 1
        nextAssistantId = fallbackId
      }

      const target = messages[targetIndex]
      if (target && target.role === 'assistant') {
        messages[targetIndex] = {
          ...target,
          content: target.content + content,
          isStreaming: true,
        }
        nextAssistantId = target.id
      }

      return {
        messages,
        isStreaming: true,
        currentAssistantId: nextAssistantId,
      }
    })
  },

  endAssistant: (content) => {
    set((state) => {
      const messages = [...state.messages]
      const assistantId = state.currentAssistantId

      let targetIndex = assistantId
        ? messages.findIndex((message) => message.id === assistantId)
        : -1

      if (targetIndex === -1) {
        for (let i = messages.length - 1; i >= 0; i -= 1) {
          const message = messages[i]
          if (message?.role === 'assistant' && message.isStreaming) {
            targetIndex = i
            break
          }
        }
      }

      if (targetIndex !== -1) {
        const target = messages[targetIndex]
        if (target && target.role === 'assistant') {
          messages[targetIndex] = {
            ...target,
            content: content || target.content,
            isStreaming: false,
          }
        }
      } else {
        const lastMessage = messages[messages.length - 1]
        if (lastMessage?.role === 'assistant' && !lastMessage.isStreaming) {
          if (content) {
            messages[messages.length - 1] = {
              ...lastMessage,
              content: content || lastMessage.content,
            }
          }
        } else if (content) {
          messages.push({
            id: generateId(),
            role: 'assistant',
            content,
            timestamp: Date.now(),
            isStreaming: false,
          })
        }
      }

      return { messages, isStreaming: false, currentAssistantId: null }
    })
  },

  addToolStart: (payload) => {
    set((state) => {
      const event: ToolEventPayload = {
        kind: 'tool_event',
        toolId: payload.id,
        name: payload.name,
        status: 'running',
        startedAt: payload.startedAt,
        input: payload.input,
      }

      const message: ChatMessage = {
        id: generateId(),
        role: 'event',
        content: formatToolEventContent(event),
        timestamp: parseTimestamp(payload.startedAt),
        event,
      }

      return { messages: [...state.messages, message] }
    })
  },

  updateToolEnd: (payload) => {
    set((state) => {
      const messages = [...state.messages]
      let targetIndex = -1
      for (let i = messages.length - 1; i >= 0; i -= 1) {
        const message = messages[i]
        if (
          message?.role === 'event' &&
          message.event?.kind === 'tool_event' &&
          message.event.toolId === payload.id
        ) {
          targetIndex = i
          break
        }
      }

      if (targetIndex !== -1) {
        const target = messages[targetIndex]
        if (target && target.event?.kind === 'tool_event') {
          const nextEvent: ToolEventPayload = {
            ...target.event,
            status: payload.status,
            endedAt: payload.endedAt,
            durationMs: payload.durationMs,
            message: payload.message,
            name: payload.name,
          }

          messages[targetIndex] = {
            ...target,
            timestamp: parseTimestamp(payload.endedAt),
            content: formatToolEventContent(nextEvent),
            event: nextEvent,
          }
        }

        return { messages }
      }

      const fallbackEvent: ToolEventPayload = {
        kind: 'tool_event',
        toolId: payload.id,
        name: payload.name,
        status: payload.status,
        startedAt: payload.endedAt,
        endedAt: payload.endedAt,
        durationMs: payload.durationMs,
        message: payload.message,
      }

      const fallbackMessage: ChatMessage = {
        id: generateId(),
        role: 'event',
        content: formatToolEventContent(fallbackEvent),
        timestamp: parseTimestamp(payload.endedAt),
        event: fallbackEvent,
      }

      return { messages: [...messages, fallbackMessage] }
    })
  },

  addTurnSummary: (payload) => {
    set((state) => {
      const summaryEvent: TurnSummaryPayload = {
        kind: 'turn_summary',
        startedAt: payload.startedAt,
        endedAt: payload.endedAt,
        durationMs: payload.durationMs,
        tools: payload.tools,
        stopped: payload.stopped,
      }

      const message: ChatMessage = {
        id: generateId(),
        role: 'event',
        content: formatTurnSummaryContent(summaryEvent),
        timestamp: parseTimestamp(payload.endedAt),
        event: summaryEvent,
      }

      return { messages: [...state.messages, message] }
    })
  },

  setConfirmation: (confirmation) => set({ pendingConfirmation: confirmation }),

  loadHistory: (history) => {
    const messages: ChatMessage[] = []

    for (const entry of history) {
      const parsedTs = new Date(entry.timestamp).getTime()
      const baseTs = Number.isFinite(parsedTs) ? parsedTs : Date.now()

      messages.push({
        id: generateId(),
        role: 'user',
        content: entry.userMessage,
        timestamp: baseTs,
      })

      const historyToolCalls = entry.toolCalls || []
      historyToolCalls.forEach((toolCall, index) => {
        const status = toolCall.success === false ? 'error' : 'success'
        const event: ToolEventPayload = {
          kind: 'tool_event',
          toolId: generateId(),
          name: toolCall.name,
          status,
          startedAt: entry.timestamp,
          endedAt: entry.timestamp,
          input: toolCall.args ? { raw: toolCall.args } : undefined,
          message: status === 'error' ? toolCall.result : undefined,
        }

        messages.push({
          id: generateId(),
          role: 'event',
          content: formatToolEventContent(event),
          timestamp: baseTs + index + 1,
          event,
        })
      })

      messages.push({
        id: generateId(),
        role: 'assistant',
        content: entry.assistantResponse,
        timestamp: baseTs + historyToolCalls.length + 2,
      })
    }

    set({ messages, isStreaming: false, currentAssistantId: null })
  },

  clearMessages: () => set({ messages: [], isStreaming: false, currentAssistantId: null }),
}))
