import { useState } from 'react'
import type { ToolCall } from '@/lib/ws-types'
import { ToolRow } from './ToolRow'

interface ToolBlockProps {
  toolCalls: ToolCall[]
}

export function ToolBlock({ toolCalls }: ToolBlockProps) {
  const [expanded, setExpanded] = useState(false)

  if (toolCalls.length === 0) return null

  const runningCount = toolCalls.filter((t) => t.status === 'running').length
  const successCount = toolCalls.filter((t) => t.status === 'success').length
  const errorCount = toolCalls.filter((t) => t.status === 'error').length

  return (
    <div className="my-2 border border-border-1 rounded-lg overflow-hidden bg-bg-1">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-3 py-2 hover:bg-bg-2 transition-colors"
      >
        <div className="flex items-center gap-2 text-sm">
          <svg
            className={`w-4 h-4 text-txt-3 transition-transform ${expanded ? 'rotate-90' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <span className="text-txt-2">Tool Calls</span>
          <span className="text-txt-3">({toolCalls.length})</span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          {runningCount > 0 && (
            <span className="flex items-center gap-1 text-warning">
              <span className="w-1.5 h-1.5 rounded-full bg-warning animate-pulse" />
              {runningCount}
            </span>
          )}
          {successCount > 0 && (
            <span className="flex items-center gap-1 text-success">
              <span className="w-1.5 h-1.5 rounded-full bg-success" />
              {successCount}
            </span>
          )}
          {errorCount > 0 && (
            <span className="flex items-center gap-1 text-error">
              <span className="w-1.5 h-1.5 rounded-full bg-error" />
              {errorCount}
            </span>
          )}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-border-1">
          {toolCalls.map((tool) => (
            <ToolRow key={tool.id} tool={tool} />
          ))}
        </div>
      )}
    </div>
  )
}
