import { useEffect, useMemo, useRef } from 'react'
import { useChatStore } from '@/stores/chat'
import type { ChatMessage } from '@/lib/ws-types'
import { UserMessage } from './UserMessage'
import { AssistantMessage } from './AssistantMessage'
import { EmptyState } from './EmptyState'
import { EventMessage } from './EventMessage'
import { EventGroup } from './EventGroup'

type RenderItem =
  | { type: 'message'; message: ChatMessage }
  | { type: 'event_group'; id: string; messages: ChatMessage[] }

function buildRenderItems(messages: ChatMessage[]): RenderItem[] {
  const items: RenderItem[] = []

  for (let i = 0; i < messages.length; i += 1) {
    const message = messages[i]
    if (!message) continue

    if (message.role !== 'event') {
      items.push({ type: 'message', message })
      continue
    }

    const group: ChatMessage[] = [message]
    let cursor = i + 1

    while (cursor < messages.length) {
      const next = messages[cursor]
      if (!next || next.role !== 'event') break
      group.push(next)
      cursor += 1
    }

    if (group.length === 1) {
      items.push({ type: 'message', message })
    } else {
      const first = group[0]
      const last = group[group.length - 1]
      const groupId = `event-group:${first?.id ?? i}:${last?.id ?? cursor}`
      items.push({ type: 'event_group', id: groupId, messages: group })
    }

    i = cursor - 1
  }

  return items
}

export function MessageList() {
  const messages = useChatStore((state) => state.messages)
  const isStreaming = useChatStore((state) => state.isStreaming)
  const containerRef = useRef<HTMLDivElement>(null)

  const renderItems = useMemo(() => buildRenderItems(messages), [messages])

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
      {renderItems.map((item) => {
        if (item.type === 'event_group') {
          return <EventGroup key={item.id} messages={item.messages} />
        }

        const message = item.message
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
