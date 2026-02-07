import { useEffect } from 'react'
import { useUIStore } from '@/stores/ui'
import { useChat } from './useChat'

export function useKeyboard() {
  const { toggleSidebar, openDrawer, closeDrawer, activeDrawer } = useUIStore()
  const { clearChat } = useChat()

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Check for Cmd/Ctrl modifier
      const isMod = e.metaKey || e.ctrlKey

      if (!isMod) return

      switch (e.key.toLowerCase()) {
        case 'k':
          // Cmd+K: Focus input (handled by ChatInput)
          break

        case 'n':
          // Cmd+N: New chat
          e.preventDefault()
          clearChat()
          break

        case 'b':
          // Cmd+B: Toggle sidebar
          e.preventDefault()
          toggleSidebar()
          break

        case '.':
          // Cmd+.: Open settings
          e.preventDefault()
          if (activeDrawer === 'settings') {
            closeDrawer()
          } else {
            openDrawer('settings')
          }
          break

        case 'escape':
          // Escape: Close drawer
          if (activeDrawer) {
            e.preventDefault()
            closeDrawer()
          }
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [toggleSidebar, openDrawer, closeDrawer, activeDrawer, clearChat])
}
