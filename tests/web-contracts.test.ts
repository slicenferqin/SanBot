import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { startWebServer, type StartedWebServer } from '../src/web/server.ts';
import type { Config } from '../src/config/types.ts';

const TEST_CONFIG: Config = {
  llm: {
    provider: 'anthropic',
    model: 'claude-sonnet-4-20250514',
    apiKey: 'test-api-key',
    temperature: 0.2,
  },
};

let webServer: StartedWebServer | null = null;
let baseUrl = '';

function waitForOpen(ws: WebSocket, timeoutMs = 8000): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('WebSocket open timeout'));
    }, timeoutMs);

    const handleOpen = () => {
      clearTimeout(timeout);
      ws.removeEventListener('open', handleOpen as EventListener);
      ws.removeEventListener('error', handleError as EventListener);
      resolve();
    };

    const handleError = () => {
      clearTimeout(timeout);
      ws.removeEventListener('open', handleOpen as EventListener);
      ws.removeEventListener('error', handleError as EventListener);
      reject(new Error('WebSocket open error'));
    };

    ws.addEventListener('open', handleOpen as EventListener);
    ws.addEventListener('error', handleError as EventListener);
  });
}

function waitForMessage(
  ws: WebSocket,
  matcher: (payload: any) => boolean,
  timeoutMs = 10000,
): Promise<any> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error('WebSocket message timeout'));
    }, timeoutMs);

    const handleMessage = (event: MessageEvent<string>) => {
      try {
        const payload = JSON.parse(event.data);
        if (!matcher(payload)) {
          return;
        }
        cleanup();
        resolve(payload);
      } catch {
        // Ignore malformed payloads and keep waiting.
      }
    };

    const handleError = () => {
      cleanup();
      reject(new Error('WebSocket message error'));
    };

    const cleanup = () => {
      clearTimeout(timeout);
      ws.removeEventListener('message', handleMessage as EventListener);
      ws.removeEventListener('error', handleError as EventListener);
    };

    ws.addEventListener('message', handleMessage as EventListener);
    ws.addEventListener('error', handleError as EventListener);
  });
}

beforeAll(async () => {
  webServer = await startWebServer(0, {
    config: TEST_CONFIG,
  });
  baseUrl = `http://127.0.0.1:${webServer.port}`;
});

afterAll(() => {
  webServer?.stop();
  webServer = null;
});

describe('Web API and WS contracts', () => {
  test('GET /api/health returns stable observability shape', async () => {
    const response = await fetch(`${baseUrl}/api/health`);
    expect(response.status).toBe(200);

    const payload = await response.json();
    expect(payload.status).toBe('ok');
    expect(typeof payload.timestamp).toBe('string');
    expect(typeof payload.uptimeMs).toBe('number');
    expect(payload.uptimeMs).toBeGreaterThanOrEqual(0);

    expect(typeof payload.websocket?.connections).toBe('number');
    expect(typeof payload.websocket?.activeSessions).toBe('number');

    expect(typeof payload.sessionPool?.size).toBe('number');
    expect(typeof payload.sessionPool?.maxSize).toBe('number');
    expect(payload.sessionPool.maxSize).toBeGreaterThan(0);
    expect(typeof payload.sessionPool?.idleTtlMs).toBe('number');
    expect(typeof payload.sessionPool?.sweepIntervalMs).toBe('number');
    expect(Array.isArray(payload.sessionPool?.topSessions)).toBe(true);
  });

  test('GET /api/context gracefully falls back on invalid query params', async () => {
    const response = await fetch(
      `${baseUrl}/api/context?sessionId=invalid%20id&limit=-2&eventsLimit=9999`,
    );
    expect(response.status).toBe(200);

    const payload = await response.json();
    expect(payload.session?.sessionId).toBeNull();
    expect(Array.isArray(payload.recentConversations)).toBe(true);
    expect(payload.recentConversations.length).toBeLessThanOrEqual(5);
    expect(Array.isArray(payload.events)).toBe(true);
    expect(payload.events.length).toBeLessThanOrEqual(100);
    expect(typeof payload.injection).toBe('string');
  });

  test('GET /api/sessions accepts invalid bounds and returns normalized payload', async () => {
    const response = await fetch(`${baseUrl}/api/sessions?days=-1&limit=9999`);
    expect(response.status).toBe(200);

    const payload = await response.json();
    expect(Array.isArray(payload.sessions)).toBe(true);
    expect(payload.sessions.length).toBeLessThanOrEqual(200);

    const first = payload.sessions[0];
    if (first) {
      expect(typeof first.sessionId).toBe('string');
      expect(typeof first.title).toBe('string');
      expect(typeof first.startedAt).toBe('string');
      expect(typeof first.lastActivityAt).toBe('string');
      expect(typeof first.turns).toBe('number');
      expect(typeof first.preview).toBe('string');
    }
  });

  test('GET /api/debug/snapshot supports redaction toggle', async () => {
    const defaultResponse = await fetch(`${baseUrl}/api/debug/snapshot`);
    expect(defaultResponse.status).toBe(200);

    const defaultPayload = await defaultResponse.json();
    expect(defaultPayload.redacted).toBe(true);
    expect(typeof defaultPayload.generatedAt).toBe('string');
    expect(Array.isArray(defaultPayload.activeConnections)).toBe(true);
    expect(Array.isArray(defaultPayload.recentSessions)).toBe(true);

    const rawResponse = await fetch(`${baseUrl}/api/debug/snapshot?redact=0`);
    expect(rawResponse.status).toBe(200);

    const rawPayload = await rawResponse.json();
    expect(rawPayload.redacted).toBe(false);
    expect(typeof rawPayload.runtime?.frontendMode).toBe('string');
  });

  test('WS outbound messages include envelope metadata and monotonic seq', async () => {
    const ws = new WebSocket(`${baseUrl.replace('http', 'ws')}/ws`);
    await waitForOpen(ws);

    const first = await waitForMessage(ws, (payload) => payload?.type === 'system');
    expect(first.meta?.v).toBe(1);
    expect(typeof first.meta?.seq).toBe('number');
    expect(typeof first.meta?.messageId).toBe('string');
    expect(typeof first.meta?.connectionId).toBe('string');

    ws.send(JSON.stringify({ type: 'llm_get_providers' }));

    const llmConfig = await waitForMessage(ws, (payload) => payload?.type === 'llm_config');
    expect(llmConfig.meta?.v).toBe(1);
    expect(typeof llmConfig.meta?.seq).toBe('number');
    expect(llmConfig.meta.seq).toBeGreaterThan(first.meta.seq);
    expect(llmConfig.meta.connectionId).toBe(first.meta.connectionId);
    expect(typeof llmConfig.meta?.timestamp).toBe('string');

    ws.close();
  });
});
