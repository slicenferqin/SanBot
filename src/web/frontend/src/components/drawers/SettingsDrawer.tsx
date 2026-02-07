import { useState } from 'react'
import { Drawer } from './Drawer'
import { useConnectionStore } from '@/stores/connection'

export function SettingsDrawer() {
  const { providerId, model, temperature, providers, models, updateLLM } = useConnectionStore()
  const [selectedProvider, setSelectedProvider] = useState(providerId)
  const [selectedModel, setSelectedModel] = useState(model)
  const [selectedTemp, setSelectedTemp] = useState(temperature)
  const [saving, setSaving] = useState(false)

  const ws = useConnectionStore((state) => state.ws)

  const handleProviderChange = (newProviderId: string) => {
    setSelectedProvider(newProviderId)
    // Request models for new provider
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'llm_get_models',
        providerId: newProviderId,
      }))
    }
  }

  const handleSave = () => {
    setSaving(true)
    updateLLM(selectedProvider, selectedModel, selectedTemp)
    setTimeout(() => setSaving(false), 500)
  }

  const hasChanges = selectedProvider !== providerId || selectedModel !== model || selectedTemp !== temperature

  return (
    <Drawer title="Settings">
      <div className="p-4 space-y-6">
        {/* LLM Configuration */}
        <div className="space-y-4">
          <h3 className="text-sm font-medium text-txt-1">LLM Configuration</h3>

          {/* Provider */}
          <div className="space-y-1">
            <label className="text-xs text-txt-3">Provider</label>
            <select
              value={selectedProvider}
              onChange={(e) => handleProviderChange(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-border-1 bg-bg-2 text-sm text-txt-1"
            >
              {providers.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          {/* Model */}
          <div className="space-y-1">
            <label className="text-xs text-txt-3">Model</label>
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-border-1 bg-bg-2 text-sm text-txt-1"
            >
              {models.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>

          {/* Temperature */}
          <div className="space-y-1">
            <label className="text-xs text-txt-3">Temperature: {selectedTemp.toFixed(2)}</label>
            <input
              type="range"
              min="0"
              max="2"
              step="0.1"
              value={selectedTemp}
              onChange={(e) => setSelectedTemp(parseFloat(e.target.value))}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-txt-3">
              <span>Precise</span>
              <span>Creative</span>
            </div>
          </div>

          {/* Save button */}
          <button
            onClick={handleSave}
            disabled={!hasChanges || saving}
            className="w-full px-4 py-2 rounded-lg bg-accent text-white text-sm hover:bg-accent/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>

        {/* Keyboard Shortcuts */}
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-txt-1">Keyboard Shortcuts</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-txt-2">Focus input</span>
              <kbd className="px-2 py-0.5 rounded bg-bg-2 text-txt-3 text-xs">⌘K</kbd>
            </div>
            <div className="flex justify-between">
              <span className="text-txt-2">New chat</span>
              <kbd className="px-2 py-0.5 rounded bg-bg-2 text-txt-3 text-xs">⌘N</kbd>
            </div>
            <div className="flex justify-between">
              <span className="text-txt-2">Toggle sidebar</span>
              <kbd className="px-2 py-0.5 rounded bg-bg-2 text-txt-3 text-xs">⌘B</kbd>
            </div>
            <div className="flex justify-between">
              <span className="text-txt-2">Settings</span>
              <kbd className="px-2 py-0.5 rounded bg-bg-2 text-txt-3 text-xs">⌘.</kbd>
            </div>
            <div className="flex justify-between">
              <span className="text-txt-2">Send message</span>
              <kbd className="px-2 py-0.5 rounded bg-bg-2 text-txt-3 text-xs">⌘↵</kbd>
            </div>
          </div>
        </div>

        {/* About */}
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-txt-1">About</h3>
          <div className="text-sm text-txt-2">
            <p>SanBot v0.1.0</p>
            <p className="text-txt-3 mt-1">
              Autonomous super-assistant with self-tooling capabilities.
            </p>
          </div>
        </div>
      </div>
    </Drawer>
  )
}
