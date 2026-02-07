import { useEffect, useRef, useCallback } from 'react'
import { useConnectionStore } from '@/stores/connection'
import { useChatStore } from '@/stores/chat'
import type { ServerMessage } from '@/lib/ws-types'

const SESSION_STORAGE_KEY = 'sanbot_session_id'
const SESSION_COOKIE_NAME = 'sanbot_session'
const SESSION_ID_PATTERN = /^[A-Za-z0-9._-]{1,128}$/

function normalizeSessionId(value: string | null | undefined): string | null {
  if (!value) return null
  const trimmed = value.trim()
  if (!trimmed) return null
  if (!SESSION_ID_PATTERN.test(trimmed)) return null
  return trimmed
}

function readSessionIdFromStorage(): string | null {
  if (typeof window === 'undefined') return null

  const querySessionId = normalizeSessionId(
    new URLSearchParams(window.location.search).get('sessionId'),
  )
  if (querySessionId) {
    return querySessionId
  }

  const storedSessionId = normalizeSessionId(
    window.localStorage.getItem(SESSION_STORAGE_KEY),
  )
  if (storedSessionId) {
    return storedSessionId
  }

  return null
}

function persistSessionId(sessionId: string): void {
  if (typeof window === 'undefined') return

  window.localStorage.setItem(SESSION_STORAGE_KEY, sessionId)
  document.cookie = `${SESSION_COOKIE_NAME}=${encodeURIComponent(sessionId)}; Path=/; Max-Age=2592000; SameSite=Lax`

  const url = new URL(window.location.href)
  if (url.searchParams.get('sessionId') !== sessionId) {
    url.searchParams.set('sessionId', sessionId)
    window.history.replaceState({}, '', url.toString())
  }
}

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimeoutRef = useRef<number | null>(null)

  const setStatus = useConnectionStore((state) => state.setStatus)
  const setWs = useConnectionStore((state) => state.setWs)
  const sessionId = useConnectionStore((state) => state.sessionId)
  const setSessionId = useConnectionStore((state) => state.setSessionId)
  const setProviderConfig = useConnectionStore((state) => state.setProviderConfig)
  const setModels = useConnectionStore((state) => state.setModels)

  const addSystemMessage = useChatStore((state) => state.addSystemMessage)
  const startAssistant = useChatStore((state) => state.startAssistant)
  const appendDelta = useChatStore((state) => state.appendDelta)
  const endAssistant = useChatStore((state) => state.endAssistant)
  const addToolStart = useChatStore((state) => state.addToolStart)
  const updateToolEnd = useChatStore((state) => state.updateToolEnd)
  const setConfirmation = useChatStore((state) => state.setConfirmation)
  const loadHistory = useChatStore((state) => state.loadHistory)

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

      case 'session_bound': {
        const nextSessionId = normalizeSessionId(data.sessionId)
        if (nextSessionId) {
          setSessionId(nextSessionId)
          persistSessionId(nextSessionId)
        }
        break
      }

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
    setSessionId,
    setProviderConfig,
    setModels,
  ])

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return

    setStatus('connecting')

    const candidateSessionId = normalizeSessionId(sessionId) ?? readSessionIdFromStorage()
    if (candidateSessionId && candidateSessionId !== sessionId) {
      setSessionId(candidateSessionId)
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsUrl = new URL(`${protocol}//${window.location.host}/ws`)
    if (candidateSessionId) {
      wsUrl.searchParams.set('sessionId', candidateSessionId)
    }

    const ws = new WebSocket(wsUrl.toString())

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
  }, [handleMessage, sessionId, setSessionId, setStatus, setWs])

  useEffect(() => {
    const restoredSessionId = readSessionIdFromStorage()
    if (restoredSessionId && restoredSessionId !== sessionId) {
      setSessionId(restoredSessionId)
    }
  }, [sessionId, setSessionId])

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
