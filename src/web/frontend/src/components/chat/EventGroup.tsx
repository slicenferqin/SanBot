import { useEffect, useMemo, useState } from 'react'
import type { ChatMessage, ToolEventPayload } from '@/lib/ws-types'
import { EventMessage } from './EventMessage'

interface EventGroupProps {
  messages: ChatMessage[]
}

function getToolEventStats(messages: ChatMessage[]): {
  running: number
  success: number
  error: number
} {
  let running = 0
  let success = 0
  let error = 0

  for (const message of messages) {
    if (message.event?.kind !== 'tool_event') continue

    const status = (message.event as ToolEventPayload).status
    if (status === 'running') running += 1
    else if (status === 'success') success += 1
    else if (status === 'error') error += 1
  }

  return { running, success, error }
}

export function EventGroup({ messages }: EventGroupProps) {
  const stats = useMemo(() => getToolEventStats(messages), [messages])
  const defaultExpanded = stats.running > 0 || messages.length <= 2
  const [expanded, setExpanded] = useState(defaultExpanded)

  useEffect(() => {
    if (stats.running > 0) {
      setExpanded(true)
    }
  }, [stats.running])

  return (
    <div className="rounded-lg border border-border-1 bg-bg-1 overflow-hidden animate-fade-in">
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="w-full px-3 py-2 text-left hover:bg-bg-2 transition-colors"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <svg
              className={`w-3.5 h-3.5 text-txt-3 transition-transform ${expanded ? 'rotate-90' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            <span className="text-xs text-txt-2">Tool Timeline</span>
            <span className="text-[11px] text-txt-3">{messages.length} events</span>
          </div>

          <div className="flex items-center gap-2 text-[10px] text-txt-3 shrink-0">
            {stats.running > 0 && (
              <span className="text-warning">{stats.running} running</span>
            )}
            {stats.success > 0 && (
              <span className="text-success">{stats.success} ok</span>
            )}
            {stats.error > 0 && (
              <span className="text-error">{stats.error} failed</span>
            )}
          </div>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-border-1 px-2 py-2 space-y-2 bg-bg-0">
          {messages.map((message) => (
            <EventMessage key={message.id} message={message} />
          ))}
        </div>
      )}
    </div>
  )
}
