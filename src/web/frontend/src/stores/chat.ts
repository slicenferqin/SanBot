import { create } from 'zustand'
import type { ChatMessage, ToolCall, ConfirmationRequest, HistoryMessage } from '@/lib/ws-types'
import { generateId } from '@/lib/format'

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
  addToolStart: (name: string, args?: Record<string, unknown>) => void
  updateToolEnd: (name: string, success: boolean, result?: string, error?: string) => void
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
    const message: ChatMessage = {
      id,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      toolCalls: [],
      isStreaming: true,
    }
    set((state) => ({
      messages: [...state.messages, message],
      isStreaming: true,
      currentAssistantId: id,
    }))
    return id
  },

  appendDelta: (content) => {
    set((state) => {
      const messages = [...state.messages]
      const lastMsg = messages[messages.length - 1]
      if (lastMsg && lastMsg.role === 'assistant' && lastMsg.isStreaming) {
        messages[messages.length - 1] = {
          ...lastMsg,
          content: lastMsg.content + content,
        }
      }
      return { messages }
    })
  },

  endAssistant: (content) => {
    set((state) => {
      const messages = [...state.messages]
      const lastMsg = messages[messages.length - 1]
      if (lastMsg && lastMsg.role === 'assistant') {
        messages[messages.length - 1] = {
          ...lastMsg,
          content: content || lastMsg.content,
          isStreaming: false,
        }
      }
      return { messages, isStreaming: false, currentAssistantId: null }
    })
  },

  addToolStart: (name, args) => {
    set((state) => {
      const messages = [...state.messages]
      const lastMsg = messages[messages.length - 1]
      if (lastMsg && lastMsg.role === 'assistant') {
        const toolCall: ToolCall = {
          id: generateId(),
          name,
          args,
          status: 'running',
        }
        messages[messages.length - 1] = {
          ...lastMsg,
          toolCalls: [...(lastMsg.toolCalls || []), toolCall],
        }
      }
      return { messages }
    })
  },

  updateToolEnd: (name, success, result, error) => {
    set((state) => {
      const messages = [...state.messages]
      const lastMsg = messages[messages.length - 1]
      if (lastMsg && lastMsg.role === 'assistant' && lastMsg.toolCalls) {
        const toolCalls = [...lastMsg.toolCalls]
        // Find the last running tool with this name
        for (let i = toolCalls.length - 1; i >= 0; i--) {
          if (toolCalls[i]!.name === name && toolCalls[i]!.status === 'running') {
            toolCalls[i] = {
              ...toolCalls[i]!,
              status: success ? 'success' : 'error',
              result,
              error,
            }
            break
          }
        }
        messages[messages.length - 1] = {
          ...lastMsg,
          toolCalls,
        }
      }
      return { messages }
    })
  },

  setConfirmation: (confirmation) => set({ pendingConfirmation: confirmation }),

  loadHistory: (history) => {
    const messages: ChatMessage[] = []
    for (const entry of history) {
      const ts = new Date(entry.timestamp).getTime()
      // 用户消息
      messages.push({
        id: generateId(),
        role: 'user',
        content: entry.userMessage,
        timestamp: ts,
      })
      // 助手消息（含工具调用）
      const toolCalls: ToolCall[] = (entry.toolCalls || []).map((t) => ({
        id: generateId(),
        name: t.name,
        args: t.args ? { raw: t.args } : undefined,
        status: 'success' as const,
        result: t.result,
      }))
      messages.push({
        id: generateId(),
        role: 'assistant',
        content: entry.assistantResponse,
        timestamp: ts,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      })
    }
    set({ messages })
  },

  clearMessages: () => set({ messages: [], isStreaming: false, currentAssistantId: null }),
}))
