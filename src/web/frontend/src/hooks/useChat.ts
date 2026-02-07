import { useCallback } from 'react'
import { useConnectionStore } from '@/stores/connection'
import { useChatStore } from '@/stores/chat'
import { generateId } from '@/lib/format'

export function useChat() {
  const ws = useConnectionStore((state) => state.ws)
  const status = useConnectionStore((state) => state.status)
  const isStreaming = useChatStore((state) => state.isStreaming)
  const pendingConfirmation = useChatStore((state) => state.pendingConfirmation)
  const setConfirmation = useChatStore((state) => state.setConfirmation)
  const clearMessages = useChatStore((state) => state.clearMessages)
  const addUserMessage = useChatStore((state) => state.addUserMessage)

  const endAssistant = useChatStore((state) => state.endAssistant)

  const sendMessage = useCallback((content: string) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return
    if (!content.trim()) return

    // Add user message locally for immediate feedback
    addUserMessage(content.trim())

    ws.send(JSON.stringify({
      type: 'chat',
      content: content.trim(),
    }))
  }, [ws, addUserMessage])

  const sendCommand = useCallback((command: string) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return

    ws.send(JSON.stringify({
      type: 'command',
      command,
    }))
  }, [ws])

  const stopGeneration = useCallback(() => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return

    ws.send(JSON.stringify({
      type: 'stop_request',
      messageId: generateId(),
    }))

    // 立即重置前端 streaming 状态作为兜底
    endAssistant('')
  }, [ws, endAssistant])

  const respondToConfirmation = useCallback((confirmed: boolean) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return
    if (!pendingConfirmation) return

    ws.send(JSON.stringify({
      type: 'confirm_response',
      confirmed,
      confirmId: pendingConfirmation.id,
    }))

    setConfirmation(null)
  }, [ws, pendingConfirmation, setConfirmation])

  const clearChat = useCallback(() => {
    clearMessages()
    sendCommand('/new')
  }, [clearMessages, sendCommand])

  return {
    sendMessage,
    sendCommand,
    stopGeneration,
    respondToConfirmation,
    clearChat,
    isConnected: status === 'connected',
    isStreaming,
    hasPendingConfirmation: !!pendingConfirmation,
  }
}
