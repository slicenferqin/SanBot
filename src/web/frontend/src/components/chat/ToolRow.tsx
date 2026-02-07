import { useState } from 'react'
import type { ToolCall } from '@/lib/ws-types'

interface ToolRowProps {
  tool: ToolCall
}

export function ToolRow({ tool }: ToolRowProps) {
  const [showDetails, setShowDetails] = useState(false)

  const statusIcon = {
    running: (
      <span className="w-4 h-4 flex items-center justify-center">
        <span className="w-2 h-2 rounded-full bg-warning animate-pulse" />
      </span>
    ),
    success: (
      <span className="w-4 h-4 flex items-center justify-center text-success">✓</span>
    ),
    error: (
      <span className="w-4 h-4 flex items-center justify-center text-error">✗</span>
    ),
  }

  return (
    <div className="border-b border-border-1 last:border-b-0">
      <button
        onClick={() => setShowDetails(!showDetails)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-bg-2 transition-colors text-left"
      >
        {statusIcon[tool.status]}
        <span className="font-mono text-sm text-txt-1">{tool.name}</span>
        {tool.args && (
          <span className="text-xs text-txt-3 truncate max-w-[200px]">
            {JSON.stringify(tool.args)}
          </span>
        )}
      </button>

      {showDetails && (tool.result || tool.error) && (
        <div className="px-3 py-2 bg-bg-2 border-t border-border-1">
          {tool.error ? (
            <pre className="text-xs text-error font-mono whitespace-pre-wrap break-all">
              {tool.error}
            </pre>
          ) : tool.result ? (
            <pre className="text-xs text-txt-2 font-mono whitespace-pre-wrap break-all max-h-40 overflow-y-auto">
              {tool.result}
            </pre>
          ) : null}
        </div>
      )}
    </div>
  )
}
