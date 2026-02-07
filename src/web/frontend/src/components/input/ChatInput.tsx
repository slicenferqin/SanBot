import { useState, useRef, useEffect, type KeyboardEvent } from 'react'
import { useChat } from '@/hooks/useChat'

export function ChatInput() {
  const [input, setInput] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const { sendMessage, stopGeneration, isConnected, isStreaming } = useChat()

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current
    if (textarea) {
      textarea.style.height = 'auto'
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`
    }
  }, [input])

  // Focus on Cmd+K
  useEffect(() => {
    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        textareaRef.current?.focus()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const handleSubmit = () => {
    if (!input.trim() || !isConnected || isStreaming) return
    sendMessage(input)
    setInput('')
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <div className="border-t border-border-1 bg-bg-1 p-4">
      <div className="flex items-end gap-2 max-w-4xl mx-auto">
        <div className="flex-1 relative">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isConnected ? 'Type a message... (⌘↵ to send)' : 'Connecting...'}
            disabled={!isConnected}
            rows={1}
            className="w-full px-4 py-3 rounded-xl border border-border-1 bg-bg-2 text-txt-1 placeholder:text-txt-3 resize-none focus:outline-none focus:border-accent disabled:opacity-50 disabled:cursor-not-allowed"
          />
        </div>

        {isStreaming ? (
          <button
            onClick={stopGeneration}
            className="shrink-0 px-4 py-3 rounded-xl bg-error hover:bg-error/80 text-white transition-colors"
            title="Stop generation"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <rect x="6" y="6" width="12" height="12" rx="2" />
            </svg>
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={!input.trim() || !isConnected}
            className="shrink-0 px-4 py-3 rounded-xl bg-accent hover:bg-accent/80 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Send message (⌘↵)"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        )}
      </div>
    </div>
  )
}
