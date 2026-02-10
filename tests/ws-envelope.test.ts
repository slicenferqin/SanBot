import { describe, expect, test } from 'bun:test';
import { sendWebSocketMessage, type EnvelopeAwareWebSocketData } from '../src/web/adapters.ts';

type FakeSocket = {
  data: EnvelopeAwareWebSocketData;
  sent: string[];
  send: (payload: string) => void;
};

function createSocket(data: EnvelopeAwareWebSocketData): FakeSocket {
  const sent: string[] = [];
  return {
    data,
    sent,
    send: (payload: string) => sent.push(payload),
  };
}

describe('sendWebSocketMessage envelope', () => {
  test('attaches envelope metadata with incrementing sequence', () => {
    const ws = createSocket({
      messageSeq: 0,
      connectionId: 'conn-123',
      boundSessionId: 'session-abc',
      requestedSessionId: null,
    });

    sendWebSocketMessage(ws as any, { type: 'system', message: 'hello' });
    sendWebSocketMessage(ws as any, { type: 'status', status: 'idle' });

    const first = JSON.parse(ws.sent[0] || '{}');
    const second = JSON.parse(ws.sent[1] || '{}');

    expect(first.meta.v).toBe(1);
    expect(first.meta.seq).toBe(1);
    expect(first.meta.messageId).toBe('conn-123:1');
    expect(first.meta.sessionId).toBe('session-abc');

    expect(second.meta.seq).toBe(2);
    expect(second.meta.messageId).toBe('conn-123:2');
    expect(second.meta.sessionId).toBe('session-abc');
  });

  test('falls back gracefully when socket does not expose sequence state', () => {
    const ws = createSocket({
      connectionId: 'conn-plain',
      boundSessionId: 'session-plain',
    });

    sendWebSocketMessage(ws as any, { type: 'system', message: 'plain' });

    const payload = JSON.parse(ws.sent[0] || '{}');
    expect(payload.type).toBe('system');
    expect(payload.message).toBe('plain');
    expect(payload.meta).toBeUndefined();
  });
});
