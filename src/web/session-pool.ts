export interface SessionPoolOptions {
  maxSize: number;
  idleTtlMs: number;
  now?: () => number;
}

interface SessionPoolEntry<T> {
  value: T;
  createdAt: number;
  lastActiveAt: number;
}

export interface SessionPoolSweepResult {
  expired: string[];
  overflow: string[];
}

export interface SessionPoolStats {
  size: number;
  maxSize: number;
  idleTtlMs: number;
  oldestIdleMs: number;
  newestIdleMs: number;
}

export interface SessionPoolSnapshotItem {
  sessionId: string;
  createdAt: string;
  lastActiveAt: string;
  idleMs: number;
}

export class SessionPool<T> {
  private readonly entries = new Map<string, SessionPoolEntry<T>>();
  private readonly maxSize: number;
  private readonly idleTtlMs: number;
  private readonly now: () => number;

  constructor(options: SessionPoolOptions) {
    this.maxSize = Math.max(1, Math.floor(options.maxSize));
    this.idleTtlMs = Math.max(60_000, Math.floor(options.idleTtlMs));
    this.now = options.now ?? (() => Date.now());
  }

  get size(): number {
    return this.entries.size;
  }

  set(sessionId: string, value: T): SessionPoolSweepResult {
    const timestamp = this.now();
    const existing = this.entries.get(sessionId);

    this.entries.set(sessionId, {
      value,
      createdAt: existing?.createdAt ?? timestamp,
      lastActiveAt: timestamp,
    });

    const overflow = this.enforceLimit();
    return { expired: [], overflow };
  }

  get(sessionId: string, touch: boolean = true): T | undefined {
    const entry = this.entries.get(sessionId);
    if (!entry) return undefined;

    if (touch) {
      entry.lastActiveAt = this.now();
    }

    return entry.value;
  }

  has(sessionId: string): boolean {
    return this.entries.has(sessionId);
  }

  touch(sessionId: string): boolean {
    const entry = this.entries.get(sessionId);
    if (!entry) return false;
    entry.lastActiveAt = this.now();
    return true;
  }

  delete(sessionId: string): boolean {
    return this.entries.delete(sessionId);
  }

  reapExpired(activeSessionIds: ReadonlySet<string> = new Set()): string[] {
    const now = this.now();
    const expired: string[] = [];

    for (const [sessionId, entry] of this.entries.entries()) {
      if (activeSessionIds.has(sessionId)) {
        continue;
      }

      if (now - entry.lastActiveAt > this.idleTtlMs) {
        this.entries.delete(sessionId);
        expired.push(sessionId);
      }
    }

    return expired;
  }

  enforceLimit(activeSessionIds: ReadonlySet<string> = new Set()): string[] {
    if (this.entries.size <= this.maxSize) {
      return [];
    }

    const removable = Array.from(this.entries.entries())
      .filter(([sessionId]) => !activeSessionIds.has(sessionId))
      .sort((a, b) => a[1].lastActiveAt - b[1].lastActiveAt);

    const overflow: string[] = [];

    while (this.entries.size > this.maxSize) {
      const candidate = removable.shift();
      if (!candidate) {
        break;
      }

      const [sessionId] = candidate;
      if (this.entries.delete(sessionId)) {
        overflow.push(sessionId);
      }
    }

    return overflow;
  }

  sweep(activeSessionIds: ReadonlySet<string> = new Set()): SessionPoolSweepResult {
    const expired = this.reapExpired(activeSessionIds);
    const overflow = this.enforceLimit(activeSessionIds);
    return { expired, overflow };
  }

  getMostRecent(): { sessionId: string; value: T } | null {
    let mostRecent: [string, SessionPoolEntry<T>] | null = null;

    for (const entry of this.entries.entries()) {
      if (!mostRecent || entry[1].lastActiveAt > mostRecent[1].lastActiveAt) {
        mostRecent = entry;
      }
    }

    if (!mostRecent) {
      return null;
    }

    mostRecent[1].lastActiveAt = this.now();
    return {
      sessionId: mostRecent[0],
      value: mostRecent[1].value,
    };
  }

  stats(): SessionPoolStats {
    const now = this.now();

    let oldestIdleMs = 0;
    let newestIdleMs = 0;

    for (const entry of this.entries.values()) {
      const idleMs = Math.max(0, now - entry.lastActiveAt);
      if (idleMs > oldestIdleMs) {
        oldestIdleMs = idleMs;
      }
      if (newestIdleMs === 0 || idleMs < newestIdleMs) {
        newestIdleMs = idleMs;
      }
    }

    return {
      size: this.entries.size,
      maxSize: this.maxSize,
      idleTtlMs: this.idleTtlMs,
      oldestIdleMs,
      newestIdleMs,
    };
  }

  snapshot(limit = 10): SessionPoolSnapshotItem[] {
    const safeLimit = Number.isFinite(limit) && limit > 0
      ? Math.min(Math.floor(limit), 100)
      : 10;

    const now = this.now();

    return Array.from(this.entries.entries())
      .sort((a, b) => b[1].lastActiveAt - a[1].lastActiveAt)
      .slice(0, safeLimit)
      .map(([sessionId, entry]) => ({
        sessionId,
        createdAt: new Date(entry.createdAt).toISOString(),
        lastActiveAt: new Date(entry.lastActiveAt).toISOString(),
        idleMs: Math.max(0, now - entry.lastActiveAt),
      }));
  }
}
