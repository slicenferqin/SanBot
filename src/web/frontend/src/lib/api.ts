import type {
  AuditResponse,
  ToolsResponse,
  ToolLog,
  ContextResponse,
  SessionsResponse,
  HealthResponse,
  DebugSnapshotResponse,
} from './ws-types'

const API_BASE = '/api'

/**
 * Fetch audit logs
 */
export async function fetchAuditLogs(options?: {
  page?: number
  pageSize?: number
  level?: string
  action?: string
  limit?: number
}): Promise<AuditResponse> {
  const params = new URLSearchParams()
  if (options?.page) params.set('page', String(options.page))
  if (options?.pageSize) params.set('pageSize', String(options.pageSize))
  if (options?.level) params.set('level', options.level)
  if (options?.action) params.set('action', options.action)
  if (options?.limit) params.set('limit', String(options.limit))

  const res = await fetch(`${API_BASE}/audit/today?${params}`)
  if (!res.ok) throw new Error('Failed to fetch audit logs')
  return res.json()
}

/**
 * Export audit logs
 */
export async function exportAuditLogs(format: 'json' | 'csv' = 'json'): Promise<Blob> {
  const res = await fetch(`${API_BASE}/audit/export?format=${format}`)
  if (!res.ok) throw new Error('Failed to export audit logs')
  return res.blob()
}

/**
 * Fetch tools
 */
export async function fetchTools(options?: {
  page?: number
  pageSize?: number
  q?: string
  tag?: string
}): Promise<ToolsResponse> {
  const params = new URLSearchParams()
  if (options?.page) params.set('page', String(options.page))
  if (options?.pageSize) params.set('pageSize', String(options.pageSize))
  if (options?.q) params.set('q', options.q)
  if (options?.tag) params.set('tag', options.tag)

  const res = await fetch(`${API_BASE}/tools?${params}`)
  if (!res.ok) throw new Error('Failed to fetch tools')
  return res.json()
}

/**
 * Fetch tool logs
 */
export async function fetchToolLogs(name: string, limit = 10): Promise<{ tool: string; logs: ToolLog[] }> {
  const res = await fetch(`${API_BASE}/tools/logs?name=${encodeURIComponent(name)}&limit=${limit}`)
  if (!res.ok) throw new Error('Failed to fetch tool logs')
  return res.json()
}

/**
 * Run a tool
 */
export async function runTool(name: string, args?: string, params?: Record<string, unknown>): Promise<unknown> {
  const res = await fetch(`${API_BASE}/tools/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, args, params }),
  })
  if (!res.ok) throw new Error('Failed to run tool')
  return res.json()
}

/**
 * Fetch context
 */
export async function fetchContext(options?: {
  sessionId?: string | null
  limit?: number
  eventsLimit?: number
}): Promise<ContextResponse> {
  const params = new URLSearchParams()

  if (options?.sessionId) {
    params.set('sessionId', options.sessionId)
  }

  params.set('limit', String(options?.limit ?? 5))
  params.set('eventsLimit', String(options?.eventsLimit ?? 10))

  const res = await fetch(`${API_BASE}/context?${params.toString()}`)
  if (!res.ok) throw new Error('Failed to fetch context')
  return res.json()
}

/**
 * Fetch recent sessions
 */
export async function fetchSessions(days = 7, limit = 50): Promise<SessionsResponse> {
  const params = new URLSearchParams({
    days: String(days),
    limit: String(limit),
  })

  const res = await fetch(`${API_BASE}/sessions?${params.toString()}`)
  if (!res.ok) throw new Error('Failed to fetch sessions')
  return res.json()
}

/**
 * Fetch runtime health
 */
export async function fetchHealth(): Promise<HealthResponse> {
  const res = await fetch(`${API_BASE}/health`)
  if (!res.ok) throw new Error('Failed to fetch health')
  return res.json()
}

/**
 * Fetch debug snapshot
 */
export async function fetchDebugSnapshot(options?: {
  sessionsLimit?: number
  sessionDays?: number
  redact?: boolean
}): Promise<DebugSnapshotResponse> {
  const params = new URLSearchParams()
  if (options?.sessionsLimit) params.set('sessionsLimit', String(options.sessionsLimit))
  if (options?.sessionDays) params.set('sessionDays', String(options.sessionDays))
  if (typeof options?.redact === 'boolean') params.set('redact', options.redact ? '1' : '0')

  const query = params.toString()
  const res = await fetch(`${API_BASE}/debug/snapshot${query ? `?${query}` : ''}`)
  if (!res.ok) throw new Error('Failed to fetch debug snapshot')
  return res.json()
}
