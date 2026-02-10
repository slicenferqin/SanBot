import { useCallback, useEffect, useMemo, useState } from 'react'
import { useUIStore } from '@/stores/ui'
import { useConnectionStore } from '@/stores/connection'
import { useChatStore } from '@/stores/chat'
import { useChat } from '@/hooks/useChat'
import { fetchSessions } from '@/lib/api'
import type { SessionDigest } from '@/lib/ws-types'
import { formatDateTime, formatRelativeTime } from '@/lib/format'

function truncateMiddle(text: string, head = 8, tail = 6): string {
  const normalized = text.trim()
  if (normalized.length <= head + tail + 3) {
    return normalized
  }
  return `${normalized.slice(0, head)}...${normalized.slice(-tail)}`
}

function buildSessionModelLabel(
  session: SessionDigest,
  providerName?: string,
): { label: string; title: string } | null {
  const llm = session.llm
  if (!llm) {
    return null
  }

  const providerTokenSource = (providerName || llm.providerId).trim()
  const providerToken = providerTokenSource.split(/\s+/)[0] || llm.providerId
  const compactProvider = truncateMiddle(providerToken, 6, 4)
  const compactModel = truncateMiddle(llm.model, 8, 6)

  return {
    label: `${compactProvider}/${compactModel}`,
    title: `${providerName || llm.providerId} · ${llm.model} · temp ${llm.temperature.toFixed(2)}`,
  }
}

export function Sidebar() {
  const { sidebarOpen, setSidebarOpen } = useUIStore()
  const sessionId = useConnectionStore((state) => state.sessionId)
  const pendingSessionId = useConnectionStore((state) => state.pendingSessionId)
  const requestSessionSwitch = useConnectionStore((state) => state.requestSessionSwitch)
  const providers = useConnectionStore((state) => state.providers)

  const clearMessages = useChatStore((state) => state.clearMessages)
  const isStreaming = useChatStore((state) => state.isStreaming)
  const addSystemMessage = useChatStore((state) => state.addSystemMessage)

  const { clearChat } = useChat()

  const closeSidebarOnMobile = () => {
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      setSidebarOpen(false)
    }
  }

  const [sessions, setSessions] = useState<SessionDigest[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const providerNameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const provider of providers) {
      map.set(provider.id, provider.name)
    }
    return map
  }, [providers])

  const loadSessions = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const response = await fetchSessions(7, 50)
      setSessions(response.sessions)
    } catch (loadError) {
      console.error(loadError)
      setError('Failed to load sessions')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadSessions()
  }, [loadSessions, sessionId])

  useEffect(() => {
    const timer = window.setInterval(() => {
      void loadSessions()
    }, 20000)

    return () => window.clearInterval(timer)
  }, [loadSessions])

  const isSwitchingSession = Boolean(pendingSessionId)

  const handleSwitchSession = (targetSessionId: string) => {
    if (!targetSessionId || targetSessionId === sessionId) {
      return
    }

    if (isStreaming) {
      addSystemMessage('请先停止当前生成，再切换会话。')
      return
    }

    clearMessages()
    requestSessionSwitch(targetSessionId)
    addSystemMessage(`正在切换到会话 ${targetSessionId.slice(0, 8)}...`)
    closeSidebarOnMobile()
  }

  if (!sidebarOpen) return null

  return (
    <>
      {/* Mobile backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-20 md:hidden"
        onClick={() => setSidebarOpen(false)}
      />

      <aside className="fixed md:relative z-30 w-[260px] h-full border-r border-border-1 bg-bg-1 flex flex-col shrink-0">
        <div className="p-3 space-y-2">
          <button
            onClick={() => {
              clearChat()
              closeSidebarOnMobile()
            }}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-md border border-border-1 hover:bg-bg-2 transition-colors text-sm"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            <span>New Chat</span>
            <span className="ml-auto text-txt-3 text-xs hidden sm:inline">⌘N</span>
          </button>

          <button
            onClick={() => void loadSessions()}
            className="w-full text-left px-3 py-1.5 rounded-md border border-border-1 text-xs text-txt-2 hover:bg-bg-2 transition-colors"
          >
            Refresh Sessions
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-2">
          <div className="text-xs text-txt-3 uppercase tracking-wider px-2">
            Recent (7 days)
          </div>

          {isSwitchingSession && (
            <div className="mx-2 flex items-center gap-2 rounded-md border border-border-1 bg-bg-2 px-2.5 py-2 text-[11px] text-txt-2">
              <span className="h-2 w-2 rounded-full bg-warning animate-pulse" />
              <span className="truncate">Switching session…</span>
            </div>
          )}

          {loading && (
            <div className="px-3 py-2 text-xs text-txt-3">Loading sessions...</div>
          )}

          {error && (
            <div className="px-3 py-2 text-xs text-error">{error}</div>
          )}

          {!loading && !error && sessions.length === 0 && (
            <div className="px-3 py-2 text-xs text-txt-3 rounded-md border border-border-1 bg-bg-2">
              No recent sessions yet.
            </div>
          )}

          {!loading && sessions.map((session) => {
            const isPending = session.sessionId === pendingSessionId
            const isActive = session.sessionId === sessionId && !isPending
            const providerName = session.llm
              ? providerNameById.get(session.llm.providerId)
              : undefined
            const modelBadge = buildSessionModelLabel(session, providerName)

            return (
              <button
                key={session.sessionId}
                onClick={() => handleSwitchSession(session.sessionId)}
                disabled={isSwitchingSession && !isPending}
                className={`w-full text-left px-3 py-2 rounded-md border transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${
                  isPending
                    ? 'border-warning bg-bg-2'
                    : isActive
                      ? 'border-accent bg-bg-2'
                      : 'border-border-1 hover:bg-bg-2'
                }`}
                title={`${session.sessionId}\nStarted: ${formatDateTime(session.startedAt)}\nLast activity: ${formatDateTime(session.lastActivityAt)}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        isPending
                          ? 'bg-warning animate-pulse'
                          : isActive
                            ? 'bg-accent'
                            : 'bg-txt-4'
                      }`}
                    />
                    <span className="text-sm text-txt-1 truncate">{session.title}</span>
                  </div>
                  {modelBadge && (
                    <span
                      className="shrink-0 max-w-[112px] truncate rounded-full border border-border-1 px-2 py-0.5 text-[10px] text-txt-2"
                      title={modelBadge.title}
                    >
                      {modelBadge.label}
                    </span>
                  )}
                </div>

                <div className="mt-1 text-[11px] text-txt-3 line-clamp-2">
                  {session.preview || 'No assistant response preview'}
                </div>

                <div className="mt-1 flex items-center justify-between text-[10px] text-txt-3">
                  <span>{session.turns} turns</span>
                  <span>{isPending ? 'Switching…' : formatRelativeTime(session.lastActivityAt)}</span>
                </div>
              </button>
            )
          })}
        </div>

        <div className="p-3 border-t border-border-1">
          <div className="text-xs text-txt-3 px-2">
            SanBot v0.1.0
          </div>
        </div>
      </aside>
    </>
  )
}
