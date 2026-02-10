import { useEffect, useMemo, useState } from 'react'
import { Drawer } from './Drawer'
import { useConnectionStore } from '@/stores/connection'
import { fetchDebugSnapshot, fetchHealth } from '@/lib/api'
import { redactSensitiveValue } from '@/lib/redaction'
import type { DebugSnapshotResponse, HealthResponse } from '@/lib/ws-types'

function formatUptime(uptimeMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(uptimeMs / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`
  }
  return `${seconds}s`
}

function buildSnapshotFilename(): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  return `sanbot-debug-snapshot-${timestamp}.json`
}

export function SettingsDrawer() {
  const { providerId, model, temperature, providers, models, updateLLM } = useConnectionStore()
  const [selectedProvider, setSelectedProvider] = useState(providerId)
  const [selectedModel, setSelectedModel] = useState(model)
  const [selectedTemp, setSelectedTemp] = useState(temperature)
  const [saving, setSaving] = useState(false)

  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [healthLoading, setHealthLoading] = useState(false)
  const [healthError, setHealthError] = useState<string | null>(null)

  const [snapshot, setSnapshot] = useState<DebugSnapshotResponse | null>(null)
  const [snapshotLoading, setSnapshotLoading] = useState(false)
  const [snapshotError, setSnapshotError] = useState<string | null>(null)
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle')
  const [includeRawSnapshot, setIncludeRawSnapshot] = useState(false)

  const ws = useConnectionStore((state) => state.ws)

  const redactedSnapshot = useMemo(() => {
    if (!snapshot) return null
    return redactSensitiveValue(snapshot) as DebugSnapshotResponse
  }, [snapshot])

  const exportSnapshot = includeRawSnapshot ? snapshot : redactedSnapshot

  const loadHealth = async () => {
    setHealthLoading(true)
    setHealthError(null)

    try {
      const nextHealth = await fetchHealth()
      setHealth(nextHealth)
    } catch (error) {
      console.error(error)
      setHealthError('Failed to load health data')
    } finally {
      setHealthLoading(false)
    }
  }

  const loadSnapshot = async () => {
    setSnapshotLoading(true)
    setSnapshotError(null)

    try {
      const nextSnapshot = await fetchDebugSnapshot({
        sessionsLimit: 25,
        sessionDays: 7,
        redact: !includeRawSnapshot,
      })
      setSnapshot(nextSnapshot)
    } catch (error) {
      console.error(error)
      setSnapshotError('Failed to load debug snapshot')
    } finally {
      setSnapshotLoading(false)
    }
  }

  const handleCopySnapshot = async () => {
    if (!exportSnapshot) return

    try {
      await navigator.clipboard.writeText(JSON.stringify(exportSnapshot, null, 2))
      setCopyStatus('copied')
    } catch (error) {
      console.error(error)
      setCopyStatus('failed')
    } finally {
      window.setTimeout(() => setCopyStatus('idle'), 1600)
    }
  }

  const handleDownloadSnapshot = () => {
    if (!exportSnapshot) return

    const blob = new Blob([JSON.stringify(exportSnapshot, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)

    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = buildSnapshotFilename()
    document.body.appendChild(anchor)
    anchor.click()
    document.body.removeChild(anchor)

    URL.revokeObjectURL(url)
  }

  useEffect(() => {
    void loadHealth()
  }, [])

  const handleProviderChange = (newProviderId: string) => {
    setSelectedProvider(newProviderId)
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
        <div className="space-y-4">
          <h3 className="text-sm font-medium text-txt-1">LLM Configuration</h3>

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

          <div className="space-y-1">
            <label className="text-xs text-txt-3">Temperature: {selectedTemp.toFixed(2)}</label>
            <input
              type="range"
              min="0"
              max="1"
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

          <button
            onClick={handleSave}
            disabled={!hasChanges || saving}
            className="w-full px-4 py-2 rounded-lg bg-accent text-white text-sm hover:bg-accent/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-txt-1">Runtime Diagnostics</h3>
            <button
              onClick={() => void loadHealth()}
              className="px-2.5 py-1 rounded-md border border-border-1 text-xs text-txt-2 hover:bg-bg-2 transition-colors"
            >
              Refresh
            </button>
          </div>

          {healthLoading && !health ? (
            <div className="text-xs text-txt-3 p-3 rounded-lg border border-border-1 bg-bg-2">Loading runtime health...</div>
          ) : healthError ? (
            <div className="text-xs text-error p-3 rounded-lg border border-border-1 bg-bg-2">{healthError}</div>
          ) : health ? (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-lg border border-border-1 bg-bg-2 p-2">
                  <div className="text-txt-3">Uptime</div>
                  <div className="text-txt-1 mt-1">{formatUptime(health.uptimeMs)}</div>
                </div>
                <div className="rounded-lg border border-border-1 bg-bg-2 p-2">
                  <div className="text-txt-3">Connections</div>
                  <div className="text-txt-1 mt-1">{health.websocket.connections}</div>
                </div>
                <div className="rounded-lg border border-border-1 bg-bg-2 p-2">
                  <div className="text-txt-3">Active Sessions</div>
                  <div className="text-txt-1 mt-1">{health.websocket.activeSessions}</div>
                </div>
                <div className="rounded-lg border border-border-1 bg-bg-2 p-2">
                  <div className="text-txt-3">Session Pool</div>
                  <div className="text-txt-1 mt-1">{health.sessionPool.size}/{health.sessionPool.maxSize}</div>
                </div>
              </div>
              <div className="text-[11px] text-txt-3">Updated: {new Date(health.timestamp).toLocaleString()}</div>
            </div>
          ) : null}

          <div className="space-y-2 rounded-lg border border-border-1 bg-bg-2 p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs text-txt-2">Support Snapshot</div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => void loadSnapshot()}
                  className="px-2 py-1 rounded-md border border-border-1 text-[11px] text-txt-2 hover:bg-bg-3 transition-colors"
                >
                  {snapshotLoading ? 'Loading...' : 'Generate'}
                </button>
                <button
                  onClick={() => void handleCopySnapshot()}
                  disabled={!exportSnapshot}
                  className="px-2 py-1 rounded-md border border-border-1 text-[11px] text-txt-2 hover:bg-bg-3 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {copyStatus === 'copied' ? 'Copied' : copyStatus === 'failed' ? 'Copy failed' : 'Copy JSON'}
                </button>
                <button
                  onClick={handleDownloadSnapshot}
                  disabled={!exportSnapshot}
                  className="px-2 py-1 rounded-md border border-border-1 text-[11px] text-txt-2 hover:bg-bg-3 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Download
                </button>
              </div>
            </div>

            <label className="inline-flex items-center gap-2 text-[11px] text-txt-2">
              <input
                type="checkbox"
                checked={includeRawSnapshot}
                onChange={(event) => setIncludeRawSnapshot(event.target.checked)}
                className="rounded border-border-1 bg-bg-1"
              />
              Include raw session preview text (not recommended)
            </label>

            {snapshotError && (
              <div className="text-[11px] text-error">{snapshotError}</div>
            )}

            {snapshot && (
              <div className="space-y-1 text-[11px] text-txt-3">
                <div>Generated: {new Date(snapshot.generatedAt).toLocaleString()}</div>
                <div>Payload mode: {snapshot.redacted ? 'Redacted' : 'Raw'}</div>
                <div>Active Connections: {snapshot.activeConnections.length}</div>
                <div>Recent Sessions Included: {snapshot.recentSessions.length}</div>
                {snapshot.redacted === includeRawSnapshot && (
                  <div className="text-warning">Regenerate snapshot to apply the current mode toggle.</div>
                )}
              </div>
            )}
          </div>
        </div>

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
