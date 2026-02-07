import { useEffect } from 'react'
import { useWebSocket } from '@/hooks/useWebSocket'
import { useKeyboard } from '@/hooks/useKeyboard'
import { useUIStore } from '@/stores/ui'
import { Header } from '@/components/layout/Header'
import { Sidebar } from '@/components/layout/Sidebar'
import { MessageList } from '@/components/chat/MessageList'
import { ChatInput } from '@/components/input/ChatInput'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { AuditDrawer } from '@/components/drawers/AuditDrawer'
import { ToolsDrawer } from '@/components/drawers/ToolsDrawer'
import { SettingsDrawer } from '@/components/drawers/SettingsDrawer'
import { ContextDrawer } from '@/components/drawers/ContextDrawer'

function App() {
  // Initialize WebSocket connection
  useWebSocket()

  // Initialize keyboard shortcuts
  useKeyboard()

  const activeDrawer = useUIStore((state) => state.activeDrawer)
  const setSidebarOpen = useUIStore((state) => state.setSidebarOpen)

  // Hide sidebar on mobile by default
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 768) {
        setSidebarOpen(false)
      }
    }
    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [setSidebarOpen])

  return (
    <div className="h-screen flex flex-col bg-bg-0">
      <Header />

      <div className="flex-1 flex overflow-hidden">
        <Sidebar />

        <main className="flex-1 flex flex-col min-w-0">
          <MessageList />
          <ChatInput />
        </main>
      </div>

      {/* Drawers */}
      {activeDrawer === 'audit' && <AuditDrawer />}
      {activeDrawer === 'tools' && <ToolsDrawer />}
      {activeDrawer === 'settings' && <SettingsDrawer />}
      {activeDrawer === 'context' && <ContextDrawer />}

      {/* Confirm Dialog */}
      <ConfirmDialog />
    </div>
  )
}

export default App
