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
  const socketSessionIdRef = useRef<string | null>(null)
  const suppressReconnectRef = useRef(false)
  const unmountingRef = useRef(false)

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
  const addTurnSummary = useChatStore((state) => state.addTurnSummary)
  const loadHistory = useChatStore((state) => state.loadHistory)

  const connect = useCallback((force = false) => {
    const existingSocket = wsRef.current
    if (!force && (existingSocket?.readyState === WebSocket.OPEN || existingSocket?.readyState === WebSocket.CONNECTING)) {
      return
    }

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
      reconnectTimeoutRef.current = null
    }

    setStatus('connecting')

    const currentSessionId = normalizeSessionId(useConnectionStore.getState().sessionId)
    const candidateSessionId = currentSessionId ?? readSessionIdFromStorage()
    if (candidateSessionId && candidateSessionId !== currentSessionId) {
      setSessionId(candidateSessionId)
    }

    socketSessionIdRef.current = candidateSessionId

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsUrl = new URL(`${protocol}//${window.location.host}/ws`)
    if (candidateSessionId) {
      wsUrl.searchParams.set('sessionId', candidateSessionId)
    }

    const ws = new WebSocket(wsUrl.toString())
    wsRef.current = ws

    ws.onopen = () => {
      if (wsRef.current !== ws) return
      setStatus('connected')
      setWs(ws)
    }

    ws.onclose = () => {
      if (wsRef.current !== ws) return

      setStatus('disconnected')
      setWs(null)
      wsRef.current = null

      if (suppressReconnectRef.current) {
        suppressReconnectRef.current = false
        if (!unmountingRef.current) {
          connect(true)
        }
        return
      }

      if (!unmountingRef.current) {
        reconnectTimeoutRef.current = window.setTimeout(() => {
          connect()
        }, 3000)
      }
    }

    ws.onerror = () => {
      if (wsRef.current !== ws) return
      setStatus('error')
    }

    ws.onmessage = (event) => {
      try {
        const data: ServerMessage = JSON.parse(event.data)

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
            addToolStart(data)
            break

          case 'tool_end':
            updateToolEnd(data)
            break

          case 'turn_summary':
            addTurnSummary(data)
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
            const currentSessionId = normalizeSessionId(useConnectionStore.getState().sessionId)

            if (nextSessionId) {
              socketSessionIdRef.current = nextSessionId
              if (nextSessionId !== currentSessionId) {
                setSessionId(nextSessionId)
              }
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
            break
        }
      } catch (e) {
        console.error('Failed to parse WebSocket message:', e)
      }
    }
  }, [
    setSessionId,
    setStatus,
    setWs,
    addSystemMessage,
    startAssistant,
    appendDelta,
    endAssistant,
    addToolStart,
    updateToolEnd,
    addTurnSummary,
    setConfirmation,
    loadHistory,
    setProviderConfig,
    setModels,
  ])

  useEffect(() => {
    const restoredSessionId = readSessionIdFromStorage()
    if (restoredSessionId && restoredSessionId !== sessionId) {
      setSessionId(restoredSessionId)
    }
  }, [sessionId, setSessionId])

  useEffect(() => {
    const desiredSessionId = normalizeSessionId(sessionId)

    if (!desiredSessionId) {
      return
    }

    if (desiredSessionId === socketSessionIdRef.current) {
      return
    }

    persistSessionId(desiredSessionId)

    const socket = wsRef.current
    if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
      suppressReconnectRef.current = true
      socket.close()
      return
    }

    connect(true)
  }, [sessionId, connect])

  useEffect(() => {
    unmountingRef.current = false
    connect()

    return () => {
      unmountingRef.current = true

      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }

      if (wsRef.current) {
        suppressReconnectRef.current = true
        wsRef.current.close()
      }
    }
  }, [connect])

  return { connect }
}
