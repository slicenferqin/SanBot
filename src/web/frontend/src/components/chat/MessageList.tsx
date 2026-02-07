import { useEffect, useRef } from 'react'
import { useChatStore } from '@/stores/chat'
import { UserMessage } from './UserMessage'
import { AssistantMessage } from './AssistantMessage'
import { EmptyState } from './EmptyState'
import { EventMessage } from './EventMessage'

export function MessageList() {
  const messages = useChatStore((state) => state.messages)
  const isStreaming = useChatStore((state) => state.isStreaming)
  const containerRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
    }
  }, [messages, isStreaming])

  if (messages.length === 0) {
    return <EmptyState />
  }

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-y-auto px-4 py-4 space-y-4"
    >
      {messages.map((message) => {
        if (message.role === 'user') {
          return <UserMessage key={message.id} message={message} />
        }
        if (message.role === 'assistant') {
          return <AssistantMessage key={message.id} message={message} />
        }
        if (message.role === 'event') {
          return <EventMessage key={message.id} message={message} />
        }
        if (message.role === 'system') {
          return (
            <div key={message.id} className="text-center text-sm text-txt-3 py-2">
              {message.content}
            </div>
          )
        }
        return null
      })}
    </div>
  )
}
