import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdir, readdir, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

describe('session llm config storage', () => {
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

  test('saveSessionLLMConfig persists and loadSessionLLMConfig restores data', async () => {
    const storage = await import(`../src/memory/storage.ts?test=${Date.now()}-llm-save`);

    await storage.saveSessionLLMConfig('session-alpha', {
      providerId: 'laogan',
      model: 'claude-opus-4-6',
      temperature: 0.66,
    });

    const loaded = await storage.loadSessionLLMConfig('session-alpha');

    expect(loaded).not.toBeNull();
    expect(loaded?.sessionId).toBe('session-alpha');
    expect(loaded?.providerId).toBe('laogan');
    expect(loaded?.model).toBe('claude-opus-4-6');
    expect(loaded?.temperature).toBeCloseTo(0.66, 5);
  });


  test('saveSessionLLMConfig uses atomic write without leaving temp files', async () => {
    const storage = await import(`../src/memory/storage.ts?test=${Date.now()}-llm-atomic`);

    await storage.saveSessionLLMConfig('session-atomic', {
      providerId: 'openai',
      model: 'gpt-5.2',
      temperature: 0.4,
    });

    await storage.saveSessionLLMConfig('session-atomic', {
      providerId: 'openai',
      model: 'gpt-5.3',
      temperature: 0.2,
    });

    const files = await readdir(storage.SESSION_CONFIG_DIR);
    const tempFiles = files.filter((file: string) => file.includes('.tmp'));

    expect(tempFiles.length).toBe(0);
  });

  test('loadSessionLLMConfig handles invalid payload and clamps temperature', async () => {
    const storage = await import(`../src/memory/storage.ts?test=${Date.now()}-llm-invalid`);

    await storage.saveSessionLLMConfig('session-clamp', {
      providerId: 'openai',
      model: 'gpt-5.2',
      temperature: 9,
    });

    const clamped = await storage.loadSessionLLMConfig('session-clamp');
    expect(clamped?.temperature).toBe(1);

    await mkdir(storage.SESSION_CONFIG_DIR, { recursive: true });
    const invalidFilePath = join(storage.SESSION_CONFIG_DIR, 'session-broken.json');
    await writeFile(invalidFilePath, '{"oops":true}', 'utf-8');

    const broken = await storage.loadSessionLLMConfig('session-broken');
    expect(broken).toBeNull();
  });
});

async function mkTestHomeDir(): Promise<string> {
  const baseDir = join(
    tmpdir(),
    `sanbot-test-home-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  );
  await mkdir(baseDir, { recursive: true });
  return baseDir;
}
