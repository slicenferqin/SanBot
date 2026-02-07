import type { ChatMessage } from '@/lib/ws-types'
import { formatTime } from '@/lib/format'

interface UserMessageProps {
  message: ChatMessage
}

export function UserMessage({ message }: UserMessageProps) {
  return (
    <div className="flex justify-end animate-fade-in">
      <div className="max-w-[80%] px-4 py-2 rounded-2xl rounded-br-md bg-accent text-white">
        <p className="whitespace-pre-wrap break-words">{message.content}</p>
        <div className="text-xs text-white/60 mt-1 text-right">
          {formatTime(message.timestamp)}
        </div>
      </div>
    </div>
  )
}
