import type { ChatMessage } from '@/lib/ws-types'
import { formatTime } from '@/lib/format'
import { parseMarkdown } from '@/lib/markdown'
import { ToolBlock } from './ToolBlock'
import { StreamCursor } from './StreamCursor'

interface AssistantMessageProps {
  message: ChatMessage
}

export function AssistantMessage({ message }: AssistantMessageProps) {
  const hasToolCalls = message.toolCalls && message.toolCalls.length > 0

  return (
    <div className="flex animate-fade-in">
      <div className="max-w-[85%]">
        {hasToolCalls && <ToolBlock toolCalls={message.toolCalls!} />}

        {message.content && (
          <div className="px-4 py-2 rounded-2xl rounded-bl-md bg-bg-2">
            <div
              className="markdown-content text-txt-1"
              dangerouslySetInnerHTML={{ __html: parseMarkdown(message.content) }}
            />
            {message.isStreaming && <StreamCursor />}
            <div className="text-xs text-txt-3 mt-1">
              {formatTime(message.timestamp)}
            </div>
          </div>
        )}

        {!message.content && message.isStreaming && (
          <div className="px-4 py-2 rounded-2xl rounded-bl-md bg-bg-2">
            <StreamCursor />
          </div>
        )}
      </div>
    </div>
  )
}
