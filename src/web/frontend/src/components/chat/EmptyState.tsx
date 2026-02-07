import { useChat } from '@/hooks/useChat'

const EXAMPLE_PROMPTS = [
  'List all files in the current directory',
  'Show me the git status',
  'Create a simple Python script',
  'Explain the project structure',
]

export function EmptyState() {
  const { sendMessage, isConnected } = useChat()

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 animate-fade-in">
      <div className="text-center max-w-md">
        <h2 className="text-xl font-medium text-txt-1 mb-2">
          Welcome to SanBot
        </h2>
        <p className="text-txt-2 mb-8">
          Your autonomous assistant with self-tooling capabilities.
          Ask me anything or try one of these examples:
        </p>

        <div className="grid gap-2">
          {EXAMPLE_PROMPTS.map((prompt) => (
            <button
              key={prompt}
              onClick={() => isConnected && sendMessage(prompt)}
              disabled={!isConnected}
              className="text-left px-4 py-3 rounded-lg border border-border-1 bg-bg-1 hover:bg-bg-2 hover:border-border-2 transition-colors text-sm text-txt-2 hover:text-txt-1 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {prompt}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
