/**
 * ContextCompactor 单元测试
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import {
  ContextCompactor,
  DEFAULT_COMPACTION_CONFIG,
  type GenericMessage,
} from '../src/context/compaction.ts';

// 使用假的 LLM 配置（不会真正调用 API）
const fakeLLMConfig = {
  provider: 'anthropic' as const,
  model: 'claude-sonnet-4-20250514',
  apiKey: 'test-key',
};

function makeMessages(count: number): GenericMessage[] {
  const messages: GenericMessage[] = [];
  for (let i = 0; i < count; i++) {
    messages.push(
      { role: 'user', content: `User message ${i}` },
      { role: 'assistant', content: `Assistant response ${i}` }
    );
  }
  return messages;
}

function makeToolMessages(count: number, outputSize: number): GenericMessage[] {
  const messages: GenericMessage[] = [];
  const bigOutput = 'x'.repeat(outputSize);
  for (let i = 0; i < count; i++) {
    messages.push(
      { role: 'user', content: `Do something ${i}` },
      {
        role: 'assistant',
        content: [
          { type: 'tool_use', id: `tool_${i}`, name: 'exec', input: { command: 'ls' } },
        ],
      },
      {
        role: 'user',
        content: [
          { type: 'tool_result', tool_use_id: `tool_${i}`, content: bigOutput },
        ],
      },
      { role: 'assistant', content: `Done ${i}` }
    );
  }
  return messages;
}

describe('ContextCompactor', () => {
  describe('shouldCompact', () => {
    test('returns false when under message threshold', () => {
      const compactor = new ContextCompactor(fakeLLMConfig);
      const messages = makeMessages(10); // 20 messages
      expect(compactor.shouldCompact(messages)).toBe(false);
    });

    test('returns true when over message threshold', () => {
      const compactor = new ContextCompactor(fakeLLMConfig);
      const messages = makeMessages(50); // 100 messages > 80
      expect(compactor.shouldCompact(messages)).toBe(true);
    });

    test('returns true when tool output exceeds threshold', () => {
      const compactor = new ContextCompactor(fakeLLMConfig);
      // 10 tool calls with 6KB output each = 60KB > 50KB
      const messages = makeToolMessages(10, 6000);
      expect(compactor.shouldCompact(messages)).toBe(true);
    });

    test('respects custom maxMessages config', () => {
      const compactor = new ContextCompactor(fakeLLMConfig, {
        maxMessages: 10,
      });
      const messages = makeMessages(6); // 12 messages > 10
      expect(compactor.shouldCompact(messages)).toBe(true);
    });

    test('respects custom maxToolOutputBytes config', () => {
      const compactor = new ContextCompactor(fakeLLMConfig, {
        maxToolOutputBytes: 1000,
      });
      // 2 tool calls with 600 bytes each = 1200 > 1000
      const messages = makeToolMessages(2, 600);
      expect(compactor.shouldCompact(messages)).toBe(true);
    });
  });

  describe('compact (rule-based, no LLM)', () => {
    test('returns compacted=false when not needed', async () => {
      const compactor = new ContextCompactor(fakeLLMConfig, {
        useLLMSummary: false,
      });
      const messages = makeMessages(5);
      const result = await compactor.compact(messages, 'test-session');
      expect(result.compacted).toBe(false);
      expect(result.originalCount).toBe(10);
      expect(result.newCount).toBe(10);
    });

    test('compacts when over threshold', async () => {
      const compactor = new ContextCompactor(fakeLLMConfig, {
        useLLMSummary: false,
        maxMessages: 10,
        keepRecentMessages: 4,
      });
      const messages = makeMessages(8); // 16 messages > 10
      const result = await compactor.compact(messages, 'test-session');
      expect(result.compacted).toBe(true);
      expect(result.originalCount).toBe(16);
      expect(result.newCount).toBe(4);
      expect(result.summary).toContain('会话摘要');
      expect(result.snapshotPath).toBeTruthy();
    });

    test('generates rule-based summary with correct stats', async () => {
      const compactor = new ContextCompactor(fakeLLMConfig, {
        useLLMSummary: false,
        maxMessages: 10,
        keepRecentMessages: 4,
      });
      const messages = makeMessages(8);
      const result = await compactor.compact(messages, 'test-session-stats');
      // Summary should contain message counts
      expect(result.summary).toContain('用户消息数');
      expect(result.summary).toContain('助手回复数');
    });

    test('extracts decisions from messages', async () => {
      const compactor = new ContextCompactor(fakeLLMConfig, {
        useLLMSummary: false,
        maxMessages: 4,
        keepRecentMessages: 2,
      });
      const messages: GenericMessage[] = [
        { role: 'user', content: '我决定使用 TypeScript 来写这个项目' },
        { role: 'assistant', content: '好的，确定使用 TypeScript' },
        { role: 'user', content: '选择 Bun 作为运行时' },
        { role: 'assistant', content: '已确认' },
        { role: 'user', content: 'hello' },
        { role: 'assistant', content: 'hi' },
      ];
      const result = await compactor.compact(messages, 'test-extract');
      expect(result.extracted.decisions.length).toBeGreaterThan(0);
    });
  });

  describe('DEFAULT_COMPACTION_CONFIG', () => {
    test('has sensible defaults', () => {
      expect(DEFAULT_COMPACTION_CONFIG.maxMessages).toBe(80);
      expect(DEFAULT_COMPACTION_CONFIG.keepRecentMessages).toBe(20);
      expect(DEFAULT_COMPACTION_CONFIG.useLLMSummary).toBe(true);
      expect(DEFAULT_COMPACTION_CONFIG.snapshotRetentionDays).toBe(7);
    });
  });
});
