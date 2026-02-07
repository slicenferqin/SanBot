import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { appendFile, mkdir, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

interface TestRecord {
  timestamp: string;
  sessionId: string;
  userMessage: string;
  assistantResponse: string;
}

function toDateString(isoTimestamp: string): string {
  const [date] = isoTimestamp.split('T');
  return date || isoTimestamp;
}

async function writeRecords(dailyDir: string, records: TestRecord[]): Promise<void> {
  await mkdir(dailyDir, { recursive: true });

  const grouped = new Map<string, TestRecord[]>();
  for (const record of records) {
    const date = toDateString(record.timestamp);
    const list = grouped.get(date) ?? [];
    list.push(record);
    grouped.set(date, list);
  }

  for (const [date, list] of grouped.entries()) {
    const filePath = join(dailyDir, `${date}.jsonl`);
    const payload = list
      .map((record, index) => JSON.stringify({
        id: `${date}-${index}`,
        timestamp: record.timestamp,
        sessionId: record.sessionId,
        userMessage: record.userMessage,
        assistantResponse: record.assistantResponse,
      }))
      .join('\n') + '\n';

    await appendFile(filePath, payload, 'utf-8');
  }
}

describe('listSessionDigests', () => {
  const originalHome = process.env.HOME;
  const originalMemoryDir = process.env.SANBOT_MEMORY_DIR;
  let testHome = '';

  beforeEach(async () => {
    testHome = await mkTestHomeDir();
    process.env.HOME = testHome;
    process.env.SANBOT_MEMORY_DIR = join(testHome, '.sanbot', 'memory');
  });

  afterEach(async () => {
    if (originalHome !== undefined) {
      process.env.HOME = originalHome;
    }
    if (originalMemoryDir !== undefined) {
      process.env.SANBOT_MEMORY_DIR = originalMemoryDir;
    } else {
      delete process.env.SANBOT_MEMORY_DIR;
    }
    if (testHome) {
      await rm(testHome, { recursive: true, force: true });
    }
  });

  test('aggregates and sorts sessions by last activity', async () => {
    const storage = await import(`../src/memory/storage.ts?test=${Date.now()}`);

    const now = Date.now();
    const records: TestRecord[] = [
      {
        sessionId: 'session-a',
        timestamp: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
        userMessage: 'Implement feature A',
        assistantResponse: 'Done feature A',
      },
      {
        sessionId: 'session-b',
        timestamp: new Date(now - 30 * 60 * 1000).toISOString(),
        userMessage: 'Fix production issue',
        assistantResponse: 'Issue fixed successfully',
      },
      {
        sessionId: 'session-a',
        timestamp: new Date(now - 10 * 60 * 1000).toISOString(),
        userMessage: 'Polish docs for release',
        assistantResponse: 'Docs polished and published',
      },
    ];

    await writeRecords(storage.DAILY_DIR, records);

    const digests = await storage.listSessionDigests({ days: 7, limit: 10 });

    expect(digests.length).toBe(2);
    expect(digests[0]?.sessionId).toBe('session-a');
    expect(digests[0]?.turns).toBe(2);
    expect(digests[0]?.title).toContain('Implement feature A');
    expect(digests[0]?.preview).toContain('Docs polished');
    expect(digests[1]?.sessionId).toBe('session-b');
  });

  test('respects days window and limit', async () => {
    const storage = await import(`../src/memory/storage.ts?test=${Date.now()}-limit`);

    const now = Date.now();
    const recent = new Date(now - 24 * 60 * 60 * 1000).toISOString();
    const stale = new Date(now - 14 * 24 * 60 * 60 * 1000).toISOString();

    await writeRecords(storage.DAILY_DIR, [
      {
        sessionId: 'session-recent',
        timestamp: recent,
        userMessage: 'Recent chat',
        assistantResponse: 'Recent reply',
      },
      {
        sessionId: 'session-old',
        timestamp: stale,
        userMessage: 'Old chat',
        assistantResponse: 'Old reply',
      },
      {
        sessionId: 'session-recent-2',
        timestamp: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
        userMessage: 'Another chat',
        assistantResponse: 'Another reply',
      },
    ]);

    const digests = await storage.listSessionDigests({ days: 7, limit: 1 });

    expect(digests.length).toBe(1);
    expect(digests[0]?.sessionId).toBe('session-recent-2');
  });
});

async function mkTestHomeDir(): Promise<string> {
  const baseDir = join(tmpdir(), `sanbot-test-home-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  await mkdir(baseDir, { recursive: true });
  return baseDir;
}
