import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdir, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

describe('confirmation context routing', () => {
  const originalHome = process.env.HOME;
  let testHome = '';

  beforeEach(async () => {
    testHome = await mkTestHomeDir();
    process.env.HOME = testHome;
  });

  afterEach(async () => {
    if (originalHome !== undefined) {
      process.env.HOME = originalHome;
    }

    if (testHome) {
      await rm(testHome, { recursive: true, force: true });
    }
  });

  test('routes websocket confirmation by connectionId from async context', async () => {
    const confirmation = await import(`../src/utils/confirmation.ts?test=${Date.now()}-routing`);

    const calls: string[] = [];

    confirmation.setInteractiveMode(true);
    confirmation.setTuiMode(false);

    confirmation.setWebSocketConfirmCallback('conn-allow', async () => {
      calls.push('allow');
      return true;
    });

    confirmation.setWebSocketConfirmCallback('conn-deny', async () => {
      calls.push('deny');
      return false;
    });

    const allowResult = await confirmation.runWithConfirmationContext(
      {
        sessionId: 'session-allow',
        connectionId: 'conn-allow',
        source: 'web',
      },
      async () => confirmation.checkAndConfirm('rm -rf /tmp/sanbot-allow'),
    );

    const denyResult = await confirmation.runWithConfirmationContext(
      {
        sessionId: 'session-deny',
        connectionId: 'conn-deny',
        source: 'web',
      },
      async () => confirmation.checkAndConfirm('rm -rf /tmp/sanbot-deny'),
    );

    expect(allowResult.approved).toBe(true);
    expect(denyResult.approved).toBe(false);
    expect(calls).toEqual(['allow', 'deny']);

    confirmation.removeWebSocketConfirmCallback('conn-allow');
    confirmation.removeWebSocketConfirmCallback('conn-deny');
  });

  test('resolves session id from async context for audit writes', async () => {
    const confirmation = await import(`../src/utils/confirmation.ts?test=${Date.now()}-session-id`);

    confirmation.setInteractiveMode(true);
    confirmation.setTuiMode(false);

    confirmation.setWebSocketConfirmCallback('conn-audit', async () => true);

    await confirmation.runWithConfirmationContext(
      {
        sessionId: 'session-audit-123',
        connectionId: 'conn-audit',
        source: 'web',
      },
      async () => {
        const result = await confirmation.checkAndConfirm('rm -rf /tmp/sanbot-audit');
        expect(result.approved).toBe(true);
      },
    );

    const audit = await import(`../src/utils/audit-log.ts?test=${Date.now()}-session-id`);
    const logs = await audit.getTodayAuditLogs();
    const target = logs.find((entry) => entry.command.includes('/tmp/sanbot-audit'));

    expect(target).toBeDefined();
    expect(target?.sessionId).toBe('session-audit-123');

    confirmation.removeWebSocketConfirmCallback('conn-audit');
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
