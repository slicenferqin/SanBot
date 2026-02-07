import { useEffect, useMemo, useState } from 'react'
import { Drawer } from './Drawer'
import { fetchContext } from '@/lib/api'
import { useConnectionStore } from '@/stores/connection'
import type { ContextExtracted, ContextResponse } from '@/lib/ws-types'
import { formatDateTime } from '@/lib/format'

type ContextTab = 'overview' | 'events' | 'injection'

const TABS: Array<{ id: ContextTab; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'events', label: 'Events' },
  { id: 'injection', label: 'Injection' },
]

function renderExtracted(extracted: ContextExtracted | null): Array<{ label: string; items: string[] }> {
  if (!extracted) return []

  return [
    { label: 'Runtime', items: extracted.runtime ?? [] },
    { label: 'Decisions', items: extracted.decisions ?? [] },
    { label: 'Facts', items: extracted.facts ?? [] },
    { label: 'Preferences', items: extracted.preferences ?? [] },
  ].filter((group) => group.items.length > 0)
}

export function ContextDrawer() {
  const sessionId = useConnectionStore((state) => state.sessionId)

  const [activeTab, setActiveTab] = useState<ContextTab>('overview')
  const [data, setData] = useState<ContextResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle')

  const extractedGroups = useMemo(() => renderExtracted(data?.extracted ?? null), [data?.extracted])

  const loadData = async () => {
    setLoading(true)
    setError(null)

    try {
      const response = await fetchContext({
        sessionId,
        limit: 5,
        eventsLimit: 20,
      })
      setData(response)
    } catch (loadError) {
      console.error(loadError)
      setError('Failed to load context data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadData()
  }, [sessionId])

  const handleCopyInjection = async () => {
    if (!data?.injection) return

    try {
      await navigator.clipboard.writeText(data.injection)
      setCopyStatus('copied')
      window.setTimeout(() => setCopyStatus('idle'), 1200)
    } catch (copyError) {
      console.error(copyError)
      setCopyStatus('failed')
      window.setTimeout(() => setCopyStatus('idle'), 1500)
    }
  }

  return (
    <Drawer title="Context">
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-3 py-1.5 rounded-md text-xs border transition-colors ${
                  activeTab === tab.id
                    ? 'border-accent text-txt-1 bg-bg-2'
                    : 'border-border-1 text-txt-3 hover:text-txt-2 hover:bg-bg-2'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <button
            onClick={() => void loadData()}
            className="px-2.5 py-1.5 rounded-md border border-border-1 text-xs text-txt-2 hover:bg-bg-2 transition-colors"
          >
            Refresh
          </button>
        </div>

        {loading && <div className="text-sm text-txt-3">Loading context...</div>}
        {error && <div className="text-sm text-error">{error}</div>}

        {!loading && !error && data && (
          <>
            {activeTab === 'overview' && (
              <div className="space-y-4">
                <section className="p-3 rounded-lg border border-border-1 bg-bg-2">
                  <div className="text-xs text-txt-3 mb-1">Summary</div>
                  <div className="text-sm text-txt-1 whitespace-pre-wrap break-words">
                    {data.summary || 'No summary available yet.'}
                  </div>
                </section>

                <section className="p-3 rounded-lg border border-border-1 bg-bg-2 space-y-1">
                  <div className="text-xs text-txt-3">Session</div>
                  <div className="text-xs text-txt-2 break-all">
                    ID: {data.session.sessionId || sessionId || 'Not bound'}
                  </div>
                  <div className="text-xs text-txt-2">
                    Conversations: {data.session.conversationCount}
                  </div>
                  <div className="text-xs text-txt-2">
                    Last Activity: {data.session.lastActivityAt ? formatDateTime(data.session.lastActivityAt) : 'N/A'}
                  </div>
                </section>

                <section className="space-y-2">
                  <div className="text-xs uppercase tracking-wide text-txt-3">Recent Conversations</div>
                  {data.recentConversations.length === 0 ? (
                    <div className="text-xs text-txt-3 p-3 rounded-lg border border-border-1 bg-bg-2">
                      No conversations in this scope yet.
                    </div>
                  ) : (
                    data.recentConversations.map((entry, index) => (
                      <div key={`${entry.timestamp}-${index}`} className="p-3 rounded-lg border border-border-1 bg-bg-2 space-y-2">
                        <div className="text-[11px] text-txt-3">{formatDateTime(entry.timestamp)}</div>
                        <div className="text-xs text-txt-2 whitespace-pre-wrap break-words">User: {entry.userMessage}</div>
                        <div className="text-xs text-txt-1 whitespace-pre-wrap break-words">Assistant: {entry.assistantResponse}</div>
                      </div>
                    ))
                  )}
                </section>

                <section className="space-y-2">
                  <div className="text-xs uppercase tracking-wide text-txt-3">Extracted Highlights</div>
                  {extractedGroups.length === 0 ? (
                    <div className="text-xs text-txt-3 p-3 rounded-lg border border-border-1 bg-bg-2">
                      No extracted highlights yet.
                    </div>
                  ) : (
                    extractedGroups.map((group) => (
                      <div key={group.label} className="p-3 rounded-lg border border-border-1 bg-bg-2">
                        <div className="text-xs text-txt-2 mb-2">{group.label}</div>
                        <ul className="space-y-1">
                          {group.items.map((item, index) => (
                            <li key={`${group.label}-${index}`} className="text-xs text-txt-1 break-words">
                              - {item}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))
                  )}
                </section>
              </div>
            )}

            {activeTab === 'events' && (
              <div className="space-y-2">
                {data.events.length === 0 ? (
                  <div className="text-xs text-txt-3 p-3 rounded-lg border border-border-1 bg-bg-2">
                    No recent context events.
                  </div>
                ) : (
                  data.events.map((event, index) => (
                    <div key={`${event.timestamp}-${event.source}-${index}`} className="p-3 rounded-lg border border-border-1 bg-bg-2 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-txt-2">{event.source}</span>
                        <span className="text-[11px] text-txt-3">{formatDateTime(event.timestamp)}</span>
                      </div>
                      <div className="text-xs text-txt-1 break-words whitespace-pre-wrap">{event.summary}</div>
                      {event.detail && (
                        <pre className="m-0 p-2 rounded-md border border-border-1 bg-bg-1 text-[11px] text-txt-2 whitespace-pre-wrap break-all">
                          {event.detail}
                        </pre>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}

            {activeTab === 'injection' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-xs uppercase tracking-wide text-txt-3">Prompt Injection</div>
                  <button
                    onClick={() => void handleCopyInjection()}
                    className="px-2.5 py-1.5 rounded-md border border-border-1 text-xs text-txt-2 hover:bg-bg-2 transition-colors"
                  >
                    {copyStatus === 'copied' ? 'Copied' : copyStatus === 'failed' ? 'Copy Failed' : 'Copy'}
                  </button>
                </div>

                <pre className="m-0 p-3 rounded-lg border border-border-1 bg-bg-2 text-[11px] text-txt-2 whitespace-pre-wrap break-all max-h-[60vh] overflow-auto">
                  {data.injection || 'No injection content available.'}
                </pre>
              </div>
            )}
          </>
        )}
      </div>
    </Drawer>
  )
}
