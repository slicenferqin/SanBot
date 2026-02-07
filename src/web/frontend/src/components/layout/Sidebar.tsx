import { useCallback, useEffect, useState } from 'react'
import { useUIStore } from '@/stores/ui'
import { useConnectionStore } from '@/stores/connection'
import { useChatStore } from '@/stores/chat'
import { useChat } from '@/hooks/useChat'
import { fetchSessions } from '@/lib/api'
import type { SessionDigest } from '@/lib/ws-types'
import { formatDateTime, formatRelativeTime } from '@/lib/format'

export function Sidebar() {
  const { sidebarOpen, setSidebarOpen } = useUIStore()
  const sessionId = useConnectionStore((state) => state.sessionId)
  const setSessionId = useConnectionStore((state) => state.setSessionId)

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

  const handleSwitchSession = (targetSessionId: string) => {
    if (!targetSessionId || targetSessionId === sessionId) {
      return
    }

    if (isStreaming) {
      addSystemMessage('请先停止当前生成，再切换会话。')
      return
    }

    clearMessages()
    setSessionId(targetSessionId)
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
            const isActive = session.sessionId === sessionId

            return (
              <button
                key={session.sessionId}
                onClick={() => handleSwitchSession(session.sessionId)}
                className={`w-full text-left px-3 py-2 rounded-md border transition-colors ${
                  isActive
                    ? 'border-accent bg-bg-2'
                    : 'border-border-1 hover:bg-bg-2'
                }`}
                title={`${session.sessionId}\nStarted: ${formatDateTime(session.startedAt)}\nLast activity: ${formatDateTime(session.lastActivityAt)}`}
              >
                <div className="flex items-center gap-2">
                  <span className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-accent' : 'bg-txt-4'}`} />
                  <span className="text-sm text-txt-1 truncate">{session.title}</span>
                </div>

                <div className="mt-1 text-[11px] text-txt-3 line-clamp-2">
                  {session.preview || 'No assistant response preview'}
                </div>

                <div className="mt-1 flex items-center justify-between text-[10px] text-txt-3">
                  <span>{session.turns} turns</span>
                  <span>{formatRelativeTime(session.lastActivityAt)}</span>
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
