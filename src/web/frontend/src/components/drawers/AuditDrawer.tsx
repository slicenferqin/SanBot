import { useState, useEffect } from 'react'
import { Drawer } from './Drawer'
import { fetchAuditLogs, exportAuditLogs } from '@/lib/api'
import type { AuditEntry, AuditResponse } from '@/lib/ws-types'
import { formatDateTime } from '@/lib/format'

const LEVELS = ['all', 'safe', 'warning', 'danger', 'critical'] as const
const ACTIONS = ['all', 'approved', 'rejected', 'auto_blocked'] as const

export function AuditDrawer() {
  const [data, setData] = useState<AuditResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [level, setLevel] = useState<string>('all')
  const [action, setAction] = useState<string>('all')
  const [page, setPage] = useState(1)

  useEffect(() => {
    loadData()
  }, [level, action, page])

  const loadData = async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await fetchAuditLogs({
        page,
        pageSize: 20,
        level: level === 'all' ? undefined : level,
        action: action === 'all' ? undefined : action,
      })
      setData(result)
    } catch (e) {
      setError('Failed to load audit logs')
    } finally {
      setLoading(false)
    }
  }

  const handleExport = async (format: 'json' | 'csv') => {
    try {
      const blob = await exportAuditLogs(format)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `sanbot-audit-${new Date().toISOString().split('T')[0]}.${format}`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      setError('Failed to export')
    }
  }

  const levelColors: Record<string, string> = {
    safe: 'text-success',
    warning: 'text-warning',
    danger: 'text-error',
    critical: 'text-error font-bold',
  }

  const actionColors: Record<string, string> = {
    approved: 'text-success',
    rejected: 'text-error',
    auto_blocked: 'text-warning',
  }

  return (
    <Drawer title="Audit Logs">
      <div className="p-4 space-y-4">
        {/* Filters */}
        <div className="flex gap-2">
          <select
            value={level}
            onChange={(e) => { setLevel(e.target.value); setPage(1) }}
            className="px-3 py-1.5 rounded-lg border border-border-1 bg-bg-2 text-sm text-txt-1"
          >
            {LEVELS.map((l) => (
              <option key={l} value={l}>{l === 'all' ? 'All Levels' : l}</option>
            ))}
          </select>
          <select
            value={action}
            onChange={(e) => { setAction(e.target.value); setPage(1) }}
            className="px-3 py-1.5 rounded-lg border border-border-1 bg-bg-2 text-sm text-txt-1"
          >
            {ACTIONS.map((a) => (
              <option key={a} value={a}>{a === 'all' ? 'All Actions' : a.replace('_', ' ')}</option>
            ))}
          </select>
        </div>

        {/* Stats */}
        {data && (
          <div className="grid grid-cols-4 gap-2 text-center">
            <div className="px-2 py-1.5 rounded-lg bg-bg-2">
              <div className="text-lg font-medium text-txt-1">{data.filteredStats.total}</div>
              <div className="text-xs text-txt-3">Total</div>
            </div>
            <div className="px-2 py-1.5 rounded-lg bg-bg-2">
              <div className="text-lg font-medium text-success">{data.filteredStats.approved}</div>
              <div className="text-xs text-txt-3">Approved</div>
            </div>
            <div className="px-2 py-1.5 rounded-lg bg-bg-2">
              <div className="text-lg font-medium text-error">{data.filteredStats.rejected}</div>
              <div className="text-xs text-txt-3">Rejected</div>
            </div>
            <div className="px-2 py-1.5 rounded-lg bg-bg-2">
              <div className="text-lg font-medium text-warning">{data.filteredStats.autoBlocked}</div>
              <div className="text-xs text-txt-3">Blocked</div>
            </div>
          </div>
        )}

        {/* Export buttons */}
        <div className="flex gap-2">
          <button
            onClick={() => handleExport('json')}
            className="px-3 py-1.5 rounded-lg border border-border-1 text-sm text-txt-2 hover:bg-bg-2 transition-colors"
          >
            Export JSON
          </button>
          <button
            onClick={() => handleExport('csv')}
            className="px-3 py-1.5 rounded-lg border border-border-1 text-sm text-txt-2 hover:bg-bg-2 transition-colors"
          >
            Export CSV
          </button>
        </div>

        {/* Loading/Error */}
        {loading && <div className="text-center text-txt-3 py-4">Loading...</div>}
        {error && <div className="text-center text-error py-4">{error}</div>}

        {/* Logs */}
        {data && !loading && (
          <div className="space-y-2">
            {data.logs.length === 0 ? (
              <div className="text-center text-txt-3 py-4">No logs found</div>
            ) : (
              data.logs.map((log, i) => (
                <LogEntry key={`${log.timestamp}-${i}`} log={log} levelColors={levelColors} actionColors={actionColors} />
              ))
            )}
          </div>
        )}

        {/* Pagination */}
        {data && data.pagination.totalPages > 1 && (
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
      </div>
    </Drawer>
  )
}

function LogEntry({
  log,
  levelColors,
  actionColors,
}: {
  log: AuditEntry
  levelColors: Record<string, string>
  actionColors: Record<string, string>
}) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="border border-border-1 rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-3 py-2 flex items-center gap-2 hover:bg-bg-2 transition-colors text-left"
      >
        <span className={`text-xs ${levelColors[log.dangerLevel]}`}>
          {log.dangerLevel}
        </span>
        <span className={`text-xs ${actionColors[log.action]}`}>
          {log.action.replace('_', ' ')}
        </span>
        <span className="flex-1 text-sm text-txt-1 truncate font-mono">
          {log.command}
        </span>
      </button>
      {expanded && (
        <div className="px-3 py-2 border-t border-border-1 bg-bg-2 space-y-2">
          <div>
            <div className="text-xs text-txt-3">Time</div>
            <div className="text-sm text-txt-2">{formatDateTime(log.timestamp)}</div>
          </div>
          <div>
            <div className="text-xs text-txt-3">Command</div>
            <pre className="text-sm text-txt-1 font-mono whitespace-pre-wrap break-all">{log.command}</pre>
          </div>
          {log.reasons && log.reasons.length > 0 && (
            <div>
              <div className="text-xs text-txt-3">Reasons</div>
              <ul className="text-sm text-txt-2">
                {log.reasons.map((r, i) => <li key={i}>• {r}</li>)}
              </ul>
            </div>
          )}
          {log.executionResult && (
            <div>
              <div className="text-xs text-txt-3">Result</div>
              <div className="text-sm">
                <span className={log.executionResult.success ? 'text-success' : 'text-error'}>
                  {log.executionResult.success ? 'Success' : 'Failed'}
                </span>
                {log.executionResult.exitCode !== undefined && (
                  <span className="text-txt-3 ml-2">Exit: {log.executionResult.exitCode}</span>
                )}
                {log.executionResult.error && (
                  <div className="text-error text-xs mt-1">{log.executionResult.error}</div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
