import { useState } from 'react'
import type { ChatMessage, ToolEventPayload } from '@/lib/ws-types'
import { formatTime } from '@/lib/format'

interface EventMessageProps {
  message: ChatMessage
}

function stringifyDetail(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'string') return value

  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function ToolStatusDot({ event }: { event: ToolEventPayload }) {
  if (event.status === 'running') {
    return <span className="w-1.5 h-1.5 rounded-full bg-warning animate-pulse" />
  }
  if (event.status === 'error') {
    return <span className="w-1.5 h-1.5 rounded-full bg-error" />
  }
  return <span className="w-1.5 h-1.5 rounded-full bg-success" />
}

export function EventMessage({ message }: EventMessageProps) {
  const [expanded, setExpanded] = useState(false)
  const event = message.event

  if (!event) {
    return (
      <div className="text-xs text-txt-3 px-2">
        {message.content}
      </div>
    )
  }

  if (event.kind === 'turn_summary') {
    return (
      <div className="flex justify-center">
        <div className="text-xs text-txt-3 px-3 py-1 rounded-full bg-bg-1 border border-border-1">
          {message.content}
        </div>
      </div>
    )
  }

  const hasInputDetail = event.input != null
  const hasErrorDetail = Boolean(event.message)
  const hasDetails = hasInputDetail || hasErrorDetail

  const inputDetail = stringifyDetail(event.input)
  const errorDetail = event.message ?? ''

  const statusText =
    event.status === 'running'
      ? 'Running'
      : event.status === 'success'
        ? 'Completed'
        : 'Failed'

  const statusColor =
    event.status === 'running'
      ? 'text-warning'
      : event.status === 'success'
        ? 'text-success'
        : 'text-error'

  const eventTime = event.endedAt ?? event.startedAt

  return (
    <div className="flex justify-start animate-fade-in">
      <div className="max-w-[90%] text-xs rounded-lg border border-border-1 bg-bg-1 overflow-hidden">
        <button
          type="button"
          disabled={!hasDetails}
          onClick={() => {
            if (!hasDetails) return
            setExpanded((prev) => !prev)
          }}
          className={`w-full px-3 py-2 flex items-start gap-2 text-left ${hasDetails ? 'hover:bg-bg-2 transition-colors cursor-pointer' : ''}`}
        >
          <span className="pt-1">
            <ToolStatusDot event={event} />
          </span>

          <span className="flex-1 text-txt-2 leading-5">{message.content}</span>

          <span className="shrink-0 text-[10px] text-txt-3">
            {formatTime(eventTime)}
          </span>

          {hasDetails && (
            <svg
              className={`w-3 h-3 mt-1 text-txt-3 transition-transform ${expanded ? 'rotate-90' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          )}
        </button>

        <div className="px-3 pb-2 -mt-1">
          <span className={`text-[10px] ${statusColor}`}>{statusText}</span>
        </div>

        {expanded && hasDetails && (
          <div className="border-t border-border-1 bg-bg-2 px-3 py-2 space-y-2">
            {hasInputDetail && (
              <div>
                <div className="text-[10px] uppercase tracking-wide text-txt-3 mb-1">Input</div>
                <pre className="text-[11px] text-txt-2 m-0 p-2 bg-bg-1 border border-border-1 rounded-md whitespace-pre-wrap break-all">
                  {inputDetail}
                </pre>
              </div>
            )}

            {hasErrorDetail && (
              <div>
                <div className="text-[10px] uppercase tracking-wide text-txt-3 mb-1">Error</div>
                <pre className="text-[11px] text-error m-0 p-2 bg-bg-1 border border-border-1 rounded-md whitespace-pre-wrap break-all">
                  {errorDetail}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
