import { describe, expect, test } from 'bun:test';
import { SessionPool } from '../src/web/session-pool.ts';

describe('SessionPool', () => {
  test('reapExpired removes idle sessions and keeps active sessions', () => {
    let now = 1_000;
    const pool = new SessionPool<string>({
      maxSize: 10,
      idleTtlMs: 60_000,
      now: () => now,
    });

    pool.set('session-a', 'A');
    now += 10;
    pool.set('session-b', 'B');

    now += 61_000;

    const expired = pool.reapExpired(new Set(['session-a']));

    expect(expired).toEqual(['session-b']);
    expect(pool.has('session-a')).toBe(true);
    expect(pool.has('session-b')).toBe(false);
  });

  test('enforceLimit evicts least recently active sessions first', () => {
    let now = 1_000;
    const pool = new SessionPool<string>({
      maxSize: 2,
      idleTtlMs: 10_000,
      now: () => now,
    });

    pool.set('session-a', 'A');
    now += 10;
    pool.set('session-b', 'B');
    now += 10;
    pool.set('session-c', 'C');

    expect(pool.has('session-a')).toBe(false);
    expect(pool.has('session-b')).toBe(true);
    expect(pool.has('session-c')).toBe(true);
  });

  test('getMostRecent returns latest and touches it', () => {
    let now = 5_000;
    const pool = new SessionPool<string>({
      maxSize: 3,
      idleTtlMs: 60_000,
      now: () => now,
    });

    pool.set('session-a', 'A');
    now += 30_000;
    pool.set('session-b', 'B');

    const latest = pool.getMostRecent();
    expect(latest?.sessionId).toBe('session-b');

    now += 59_000;
    const expired = pool.reapExpired();

    expect(expired).toEqual(['session-a']);
    expect(pool.has('session-b')).toBe(true);
  });
});
