import type { ReactNode } from 'react'
import { useUIStore } from '@/stores/ui'

interface DrawerProps {
  title: string
  children: ReactNode
}

export function Drawer({ title, children }: DrawerProps) {
  const { closeDrawer } = useUIStore()

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/30"
        onClick={closeDrawer}
      />

      {/* Drawer panel */}
      <div className="relative w-full max-w-md bg-bg-1 border-l border-border-1 shadow-2xl animate-slide-in-right flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border-1 shrink-0">
          <h2 className="font-medium text-txt-1">{title}</h2>
          <button
            onClick={closeDrawer}
            className="p-1.5 rounded hover:bg-bg-2 transition-colors text-txt-2 hover:text-txt-1"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      </div>
    </div>
  )
}
