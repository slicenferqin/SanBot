import { useConnectionStore, type ConnectionStatus } from '@/stores/connection'
import { useUIStore } from '@/stores/ui'

function ConnectionIndicator({ status }: { status: ConnectionStatus }) {
  const colors: Record<ConnectionStatus, string> = {
    connected: 'bg-success',
    connecting: 'bg-warning animate-pulse',
    disconnected: 'bg-txt-4',
    error: 'bg-error',
  }

  const labels: Record<ConnectionStatus, string> = {
    connected: 'Connected',
    connecting: 'Connecting...',
    disconnected: 'Disconnected',
    error: 'Error',
  }

  return (
    <div className="flex items-center gap-2 text-sm text-txt-2">
      <span className={`w-2 h-2 rounded-full ${colors[status]}`} />
      <span>{labels[status]}</span>
    </div>
  )
}

function ModelDisplay() {
  const { providerId, model } = useConnectionStore()
  const { openDrawer } = useUIStore()

  if (!providerId || !model) return null

  return (
    <button
      onClick={() => openDrawer('settings')}
      className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-bg-2 hover:bg-bg-3 transition-colors text-sm"
    >
      <span className="text-txt-2">{providerId}</span>
      <span className="text-txt-3">/</span>
      <span className="text-txt-1">{model}</span>
    </button>
  )
}

export function Header() {
  const status = useConnectionStore((state) => state.status)
  const { toggleSidebar, openDrawer } = useUIStore()

  return (
    <header className="h-10 flex items-center justify-between px-4 border-b border-border-1 bg-bg-1 shrink-0">
      <div className="flex items-center gap-4">
        <button
          onClick={toggleSidebar}
          className="p-1.5 rounded hover:bg-bg-2 transition-colors text-txt-2 hover:text-txt-1"
          title="Toggle sidebar (⌘B)"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <span className="font-medium text-txt-1">SanBot</span>
      </div>

      <div className="flex items-center gap-4">
        <ModelDisplay />
        <ConnectionIndicator status={status} />

        <div className="flex items-center gap-1">
          <button
            onClick={() => openDrawer('audit')}
            className="p-1.5 rounded hover:bg-bg-2 transition-colors text-txt-2 hover:text-txt-1"
            title="Audit logs"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </button>
          <button
            onClick={() => openDrawer('tools')}
            className="p-1.5 rounded hover:bg-bg-2 transition-colors text-txt-2 hover:text-txt-1"
            title="Tools"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
          <button
            onClick={() => openDrawer('settings')}
            className="p-1.5 rounded hover:bg-bg-2 transition-colors text-txt-2 hover:text-txt-1"
            title="Settings (⌘.)"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
            </svg>
          </button>
        </div>
      </div>
    </header>
  )
}
