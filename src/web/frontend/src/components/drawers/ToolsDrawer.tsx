import { useState, useEffect } from 'react'
import { Drawer } from './Drawer'
import { fetchTools, fetchToolLogs, runTool } from '@/lib/api'
import type { ToolMeta, ToolLog, ToolsResponse } from '@/lib/ws-types'
import { formatRelativeTime } from '@/lib/format'

export function ToolsDrawer() {
  const [data, setData] = useState<ToolsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [selectedTool, setSelectedTool] = useState<ToolMeta | null>(null)

  useEffect(() => {
    loadData()
  }, [search, page])

  const loadData = async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await fetchTools({
        page,
        pageSize: 20,
        q: search || undefined,
      })
      setData(result)
    } catch (e) {
      setError('Failed to load tools')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Drawer title="Tools">
      <div className="p-4 space-y-4">
        {/* Search */}
        <input
          type="text"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1) }}
          placeholder="Search tools..."
          className="w-full px-3 py-2 rounded-lg border border-border-1 bg-bg-2 text-sm text-txt-1 placeholder:text-txt-3"
        />

        {/* Loading/Error */}
        {loading && <div className="text-center text-txt-3 py-4">Loading...</div>}
        {error && <div className="text-center text-error py-4">{error}</div>}

        {/* Tool list or detail */}
        {selectedTool ? (
          <ToolDetail tool={selectedTool} onBack={() => setSelectedTool(null)} />
        ) : (
          data && !loading && (
            <>
              <div className="space-y-2">
                {data.tools.length === 0 ? (
                  <div className="text-center text-txt-3 py-4">No tools found</div>
                ) : (
                  data.tools.map((tool) => (
                    <button
                      key={tool.name}
                      onClick={() => setSelectedTool(tool)}
                      className="w-full text-left px-3 py-2 rounded-lg border border-border-1 hover:bg-bg-2 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-sm text-txt-1">{tool.name}</span>
                        <span className="text-xs text-txt-3">{tool.usageCount} uses</span>
                      </div>
                      <div className="text-xs text-txt-2 mt-1 line-clamp-2">{tool.description}</div>
                      {tool.tags.length > 0 && (
                        <div className="flex gap-1 mt-2">
                          {tool.tags.slice(0, 3).map((tag) => (
                            <span key={tag} className="px-1.5 py-0.5 rounded bg-bg-3 text-xs text-txt-3">
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </button>
                  ))
                )}
              </div>

              {/* Pagination */}
              {data.pagination.totalPages > 1 && (
                <div className="flex items-center justify-between pt-2">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="px-3 py-1.5 rounded-lg border border-border-1 text-sm text-txt-2 hover:bg-bg-2 transition-colors disabled:opacity-50"
                  >
                    Previous
                  </button>
                  <span className="text-sm text-txt-3">
                    Page {data.pagination.page} of {data.pagination.totalPages}
                  </span>
                  <button
                    onClick={() => setPage((p) => Math.min(data.pagination.totalPages, p + 1))}
                    disabled={page === data.pagination.totalPages}
                    className="px-3 py-1.5 rounded-lg border border-border-1 text-sm text-txt-2 hover:bg-bg-2 transition-colors disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          )
        )}
      </div>
    </Drawer>
  )
}

function ToolDetail({ tool, onBack }: { tool: ToolMeta; onBack: () => void }) {
  const [logs, setLogs] = useState<ToolLog[]>([])
  const [loadingLogs, setLoadingLogs] = useState(true)
  const [args, setArgs] = useState('')
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  useEffect(() => {
    loadLogs()
  }, [tool.name])

  const loadLogs = async () => {
    setLoadingLogs(true)
    try {
      const data = await fetchToolLogs(tool.name, 5)
      setLogs(data.logs)
    } catch (e) {
      // Ignore
    } finally {
      setLoadingLogs(false)
    }
  }

  const handleRun = async () => {
    setRunning(true)
    setResult(null)
    try {
      const res = await runTool(tool.name, args)
      setResult(JSON.stringify(res, null, 2))
    } catch (e) {
      setResult(`Error: ${e instanceof Error ? e.message : 'Unknown error'}`)
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="space-y-4">
      <button
        onClick={onBack}
        className="flex items-center gap-1 text-sm text-txt-2 hover:text-txt-1 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back
      </button>

      <div>
        <h3 className="font-mono text-lg text-txt-1">{tool.name}</h3>
        <p className="text-sm text-txt-2 mt-1">{tool.description}</p>
      </div>

      <div className="grid grid-cols-2 gap-2 text-sm">
        <div className="px-3 py-2 rounded-lg bg-bg-2">
          <div className="text-txt-3 text-xs">Usage</div>
          <div className="text-txt-1">{tool.usageCount} times</div>
        </div>
        <div className="px-3 py-2 rounded-lg bg-bg-2">
          <div className="text-txt-3 text-xs">Last used</div>
          <div className="text-txt-1">{tool.lastUsedAt ? formatRelativeTime(tool.lastUsedAt) : 'Never'}</div>
        </div>
      </div>

      {tool.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {tool.tags.map((tag) => (
            <span key={tag} className="px-2 py-0.5 rounded bg-bg-3 text-xs text-txt-2">
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Run tool */}
      <div className="space-y-2">
        <div className="text-sm text-txt-2">Run Tool</div>
        <input
          type="text"
          value={args}
          onChange={(e) => setArgs(e.target.value)}
          placeholder="Arguments..."
          className="w-full px-3 py-2 rounded-lg border border-border-1 bg-bg-2 text-sm text-txt-1 placeholder:text-txt-3 font-mono"
        />
        <button
          onClick={handleRun}
          disabled={running}
          className="px-4 py-2 rounded-lg bg-accent text-white text-sm hover:bg-accent/80 transition-colors disabled:opacity-50"
        >
          {running ? 'Running...' : 'Run'}
        </button>
        {result && (
          <pre className="px-3 py-2 rounded-lg bg-bg-2 text-xs text-txt-2 font-mono overflow-x-auto max-h-40">
            {result}
          </pre>
        )}
      </div>

      {/* Recent logs */}
      <div className="space-y-2">
        <div className="text-sm text-txt-2">Recent Executions</div>
        {loadingLogs ? (
          <div className="text-xs text-txt-3">Loading...</div>
        ) : logs.length === 0 ? (
          <div className="text-xs text-txt-3">No recent executions</div>
        ) : (
          <div className="space-y-1">
            {logs.map((log, i) => (
              <div key={i} className="px-3 py-2 rounded-lg bg-bg-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className={log.success ? 'text-success' : 'text-error'}>
                    {log.success ? '✓' : '✗'}
                  </span>
                  <span className="text-txt-3">{formatRelativeTime(log.timestamp)}</span>
                </div>
                {log.args && (
                  <div className="text-txt-2 font-mono mt-1 truncate">{log.args}</div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
