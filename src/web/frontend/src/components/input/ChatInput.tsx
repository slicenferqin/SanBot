import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { useChat } from '@/hooks/useChat'
import { useConnectionStore } from '@/stores/connection'
import { useUIStore } from '@/stores/ui'

const EFFORT_PRESETS = [
  { id: 'low', label: 'Low', temperature: 0.1 },
  { id: 'balanced', label: 'Balanced', temperature: 0.3 },
  { id: 'high', label: 'High', temperature: 0.6 },
  { id: 'extra-high', label: 'Extra High', temperature: 0.9 },
] as const

type EffortPresetId = (typeof EFFORT_PRESETS)[number]['id']

function resolveEffortPreset(temperature: number): EffortPresetId {
  let closestId: EffortPresetId = 'balanced'
  let smallestDiff = Number.POSITIVE_INFINITY

  for (const preset of EFFORT_PRESETS) {
    const diff = Math.abs(temperature - preset.temperature)
    if (diff < smallestDiff) {
      smallestDiff = diff
      closestId = preset.id
    }
  }

  return closestId
}

export function ChatInput() {
  const [input, setInput] = useState('')
  const [effortPreset, setEffortPreset] = useState<EffortPresetId>('balanced')

  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const { sendMessage, stopGeneration, isConnected, isStreaming } = useChat()
  const providerId = useConnectionStore((state) => state.providerId)
  const model = useConnectionStore((state) => state.model)
  const models = useConnectionStore((state) => state.models)
  const temperature = useConnectionStore((state) => state.temperature)
  const updateLLM = useConnectionStore((state) => state.updateLLM)
  const sessionId = useConnectionStore((state) => state.sessionId)

  const openDrawer = useUIStore((state) => state.openDrawer)

  const availableModels = useMemo(() => {
    if (models.length > 0) {
      return models
    }

    if (model) {
      return [model]
    }

    return []
  }, [models, model])

  useEffect(() => {
    setEffortPreset(resolveEffortPreset(temperature))
  }, [temperature])

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current
    if (textarea) {
      textarea.style.height = 'auto'
      textarea.style.height = `${Math.min(textarea.scrollHeight, 260)}px`
    }
  }, [input])

  // Focus on Cmd+K
  useEffect(() => {
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
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

  const handleModelChange = (nextModel: string) => {
    if (!providerId || !nextModel) return

    const preset = EFFORT_PRESETS.find((item) => item.id === effortPreset) ?? EFFORT_PRESETS[1]
    if (!preset) return

    updateLLM(providerId, nextModel, preset.temperature)
  }

  const handleEffortChange = (nextEffort: EffortPresetId) => {
    setEffortPreset(nextEffort)

    if (!providerId || !model) return
    const preset = EFFORT_PRESETS.find((item) => item.id === nextEffort)
    if (!preset) return

    updateLLM(providerId, model, preset.temperature)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault()
      handleSubmit()
    }
  }

  return (
    <div className="border-t border-border-1 bg-bg-0 px-3 py-3 sm:px-4 sm:py-4">
      <div className="max-w-5xl mx-auto space-y-3">
        <div className="rounded-[24px] sm:rounded-[28px] border border-border-2 bg-bg-1 shadow-[0_8px_30px_rgba(0,0,0,0.2)] px-4 py-3 sm:px-5 sm:py-4">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isConnected ? 'Ask for follow-up changes' : 'Connecting...'}
            disabled={!isConnected}
            rows={1}
            className="w-full min-h-[84px] max-h-[260px] bg-transparent text-[20px] sm:text-[24px] lg:text-[28px] leading-[1.35] text-txt-1 placeholder:text-txt-3 resize-none border-none outline-none disabled:opacity-50 disabled:cursor-not-allowed"
          />

          <div className="mt-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => openDrawer('tools')}
                className="h-10 w-10 rounded-full border border-border-1 bg-bg-2 text-txt-2 hover:text-txt-1 hover:bg-bg-3 transition-colors"
                title="Open tools"
              >
                <svg className="w-5 h-5 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v14m7-7H5" />
                </svg>
              </button>

              <label className="inline-flex items-center gap-2 px-3 h-10 rounded-full border border-border-1 bg-bg-2 text-sm text-txt-2">
                <span className="text-txt-3">Model</span>
                <select
                  value={model}
                  onChange={(event) => handleModelChange(event.target.value)}
                  disabled={!isConnected || isStreaming || availableModels.length === 0}
                  className="bg-transparent border-none outline-none text-txt-1 disabled:opacity-50"
                >
                  {availableModels.length === 0 ? (
                    <option value="">No model</option>
                  ) : (
                    availableModels.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))
                  )}
                </select>
              </label>

              <label className="inline-flex items-center gap-2 px-3 h-10 rounded-full border border-border-1 bg-bg-2 text-sm text-txt-2">
                <span className="text-txt-3">Effort</span>
                <select
                  value={effortPreset}
                  onChange={(event) => handleEffortChange(event.target.value as EffortPresetId)}
                  disabled={!isConnected || isStreaming}
                  className="bg-transparent border-none outline-none text-txt-1 disabled:opacity-50"
                >
                  {EFFORT_PRESETS.map((preset) => (
                    <option key={preset.id} value={preset.id}>
                      {preset.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {isStreaming ? (
              <button
                onClick={stopGeneration}
                className="h-12 w-12 rounded-full bg-error hover:bg-error/80 text-white transition-colors"
                title="Stop generation"
              >
                <svg className="w-5 h-5 mx-auto" fill="currentColor" viewBox="0 0 24 24">
                  <rect x="6" y="6" width="12" height="12" rx="2" />
                </svg>
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={!input.trim() || !isConnected}
                className="h-12 w-12 rounded-full bg-accent hover:bg-accent/80 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title="Send message (⌘↵)"
              >
                <svg className="w-5 h-5 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M5 12h14m-6-6 6 6-6 6" />
                </svg>
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between px-1 text-xs text-txt-3">
          <div className="flex items-center gap-4">
            <span>Local</span>
            <span>Default permission</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="truncate max-w-[260px]">{sessionId ? `Session ${sessionId.slice(0, 8)}` : 'No session'}</span>
            <span>{providerId || 'No provider'}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
