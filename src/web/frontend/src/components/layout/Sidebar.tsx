import { useUIStore } from '@/stores/ui'
import { useChat } from '@/hooks/useChat'

export function Sidebar() {
  const { sidebarOpen, setSidebarOpen } = useUIStore()
  const { clearChat } = useChat()

  if (!sidebarOpen) return null

  return (
    <>
      {/* Mobile backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-20 md:hidden"
        onClick={() => setSidebarOpen(false)}
      />

      <aside className="fixed md:relative z-30 w-[220px] h-full border-r border-border-1 bg-bg-1 flex flex-col shrink-0">
        <div className="p-3">
          <button
            onClick={() => {
              clearChat()
              setSidebarOpen(false)
            }}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-md border border-border-1 hover:bg-bg-2 transition-colors text-sm"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            <span>New Chat</span>
            <span className="ml-auto text-txt-3 text-xs hidden sm:inline">⌘N</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-3">
          <div className="text-xs text-txt-3 uppercase tracking-wider mb-2 px-2">
            Today
          </div>
          <div className="space-y-1">
            <div className="px-3 py-2 rounded-md bg-bg-2 text-sm text-txt-1">
              Current Session
            </div>
          </div>
        </div>

        <div className="p-3 border-t border-border-1">
          <div className="text-xs text-txt-3 px-2">
            SanBot v0.1.0
          </div>
        </div>
      </aside>
    </>
  )
}
