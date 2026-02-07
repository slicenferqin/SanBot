import { useChatStore } from '@/stores/chat'
import { useChat } from '@/hooks/useChat'

export function ConfirmDialog() {
  const pendingConfirmation = useChatStore((state) => state.pendingConfirmation)
  const { respondToConfirmation } = useChat()

  if (!pendingConfirmation) return null

  const levelColors: Record<string, string> = {
    safe: 'text-success border-success/30 bg-success/10',
    warning: 'text-warning border-warning/30 bg-warning/10',
    danger: 'text-error border-error/30 bg-error/10',
    critical: 'text-error border-error/50 bg-error/20',
  }

  const levelLabels: Record<string, string> = {
    safe: 'Safe',
    warning: 'Warning',
    danger: 'Danger',
    critical: 'Critical',
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-fade-in">
      <div className="bg-bg-1 border border-border-1 rounded-xl shadow-2xl max-w-lg w-full mx-4 animate-fade-in">
        <div className="p-4 border-b border-border-1">
          <div className="flex items-center gap-2">
            <span className={`px-2 py-0.5 rounded text-xs font-medium ${levelColors[pendingConfirmation.level] || levelColors.warning}`}>
              {levelLabels[pendingConfirmation.level] || pendingConfirmation.level}
            </span>
            <h3 className="font-medium text-txt-1">Confirm Command</h3>
          </div>
        </div>

        <div className="p-4 space-y-4">
          <div>
            <div className="text-xs text-txt-3 mb-1">Command</div>
            <pre className="px-3 py-2 rounded-lg bg-bg-2 text-sm font-mono text-txt-1 overflow-x-auto">
              {pendingConfirmation.command}
            </pre>
          </div>

          {pendingConfirmation.reasons.length > 0 && (
            <div>
              <div className="text-xs text-txt-3 mb-1">Reasons</div>
              <ul className="space-y-1">
                {pendingConfirmation.reasons.map((reason, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-txt-2">
                    <span className="text-warning mt-0.5">•</span>
                    {reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="p-4 border-t border-border-1 flex justify-end gap-2">
          <button
            onClick={() => respondToConfirmation(false)}
            className="px-4 py-2 rounded-lg border border-border-1 text-txt-2 hover:bg-bg-2 transition-colors"
          >
            Reject
          </button>
          <button
            onClick={() => respondToConfirmation(true)}
            className="px-4 py-2 rounded-lg bg-accent text-white hover:bg-accent/80 transition-colors"
          >
            Approve
          </button>
        </div>
      </div>
    </div>
  )
}
