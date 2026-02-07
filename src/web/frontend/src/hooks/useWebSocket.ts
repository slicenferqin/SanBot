import { useEffect, useRef, useCallback } from 'react'
import { useConnectionStore } from '@/stores/connection'
import { useChatStore } from '@/stores/chat'
import type { ServerMessage } from '@/lib/ws-types'

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimeoutRef = useRef<number | null>(null)

  const { setStatus, setWs, setProviderConfig, setModels } = useConnectionStore()
  const {
    addSystemMessage,
    startAssistant,
    appendDelta,
    endAssistant,
    addToolStart,
    updateToolEnd,
    setConfirmation,
    loadHistory,
  } = useChatStore()

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return

    setStatus('connecting')

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsUrl = `${protocol}//${window.location.host}/ws`
    const ws = new WebSocket(wsUrl)

    ws.onopen = () => {
      setStatus('connected')
      setWs(ws)
      wsRef.current = ws
    }

    ws.onclose = () => {
      setStatus('disconnected')
      setWs(null)
      wsRef.current = null

      // Reconnect after 3 seconds
      reconnectTimeoutRef.current = window.setTimeout(() => {
        connect()
      }, 3000)
    }

    ws.onerror = () => {
      setStatus('error')
    }

    ws.onmessage = (event) => {
      try {
        const data: ServerMessage = JSON.parse(event.data)
        handleMessage(data)
      } catch (e) {
        console.error('Failed to parse WebSocket message:', e)
      }
    }
  }, [setStatus, setWs])

  const handleMessage = useCallback((data: ServerMessage) => {
    switch (data.type) {
      case 'system':
        addSystemMessage(data.message)
        break

      case 'assistant_start':
        startAssistant()
        break

      case 'assistant_delta':
        appendDelta(data.content)
        break

      case 'assistant_end':
        endAssistant(data.content)
        break

      case 'tool_start':
        addToolStart(data.name, data.args)
        break

      case 'tool_end':
        updateToolEnd(data.name, data.success, data.result, data.error)
        break

      case 'confirm_request':
        setConfirmation({
          id: data.id,
          command: data.command,
          level: data.level,
          reasons: data.reasons,
        })
        break

      case 'chat_history':
        loadHistory(data.messages)
        break

      case 'llm_config':
        setProviderConfig({
          providerId: data.providerId,
          model: data.model,
          temperature: data.temperature,
          providers: data.providers,
          models: data.models,
        })
        break

      case 'llm_models':
        setModels(data.models)
        break

      case 'llm_update_result':
        if (!data.success && data.error) {
          addSystemMessage(`LLM update failed: ${data.error}`)
        }
        break

      case 'status':
        // Status updates can be used for UI indicators
        break
    }
  }, [
    addSystemMessage,
    startAssistant,
    appendDelta,
    endAssistant,
    addToolStart,
    updateToolEnd,
    setConfirmation,
    loadHistory,
    setProviderConfig,
    setModels,
  ])

  useEffect(() => {
    connect()

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }
      if (wsRef.current) {
        wsRef.current.close()
      }
    }
  }, [connect])

  return { connect }
}
