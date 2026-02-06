/**
 * Memory Retrieval 单元测试
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { existsSync } from 'fs';
import { mkdir, writeFile, rm } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';
import {
  getSessionContext,
  formatMemoryContext,
  loadExtractedMemories,
} from '../src/memory/retrieval.ts';

const TEST_MEMORY_DIR = join(homedir(), '.sanbot-test-memory');
const TEST_EXTRACTED_DIR = join(TEST_MEMORY_DIR, 'extracted');

// 注意：这些测试需要临时修改 EXTRACTED_DIR 常量，
// 或者使用真实的 ~/.sanbot/memory 目录进行集成测试。
// 这里我们测试 formatMemoryContext 的格式化逻辑。

describe('formatMemoryContext', () => {
  test('returns empty string for empty context', () => {
    const context = {
      todayConversations: [],
      relevantMemories: [],
    };
    expect(formatMemoryContext(context)).toBe('');
  });

  test('formats L2 memories', () => {
    const context = {
      todayConversations: [],
      relevantMemories: ['User Profile: Developer', 'Key Facts: Uses TypeScript'],
    };
    const formatted = formatMemoryContext(context);
    expect(formatted).toContain('## Memory Context');
    expect(formatted).toContain('### Long-term Memory (L2)');
    expect(formatted).toContain('User Profile: Developer');
    expect(formatted).toContain('Key Facts: Uses TypeScript');
  });

  test('formats L1 extracted memories', () => {
    const context = {
      todayConversations: [],
      relevantMemories: [],
      extracted: {
        decisions: ['Use Bun as runtime'],
        facts: ['Project name is SanBot'],
        preferences: ['Prefers TypeScript'],
        runtime: [],
      },
    };
    const formatted = formatMemoryContext(context);
    expect(formatted).toContain('### Extracted Memory (L1)');
    expect(formatted).toContain('[Decision] Use Bun as runtime');
    expect(formatted).toContain('[Fact] Project name is SanBot');
    expect(formatted).toContain('[Preference] Prefers TypeScript');
  });

  test('formats L0 today conversations', () => {
    const context = {
      todayConversations: [
        {
          id: '1',
          timestamp: '2026-02-06T10:30:00Z',
          sessionId: 'test',
          userMessage: 'Hello',
          assistantResponse: 'Hi there!',
        },
      ],
      relevantMemories: [],
    };
    const formatted = formatMemoryContext(context);
    expect(formatted).toContain("### Today's Conversations (L0");
    expect(formatted).toContain('User: Hello');
    expect(formatted).toContain('Assistant: Hi there!');
  });

  test('truncates long messages', () => {
    const longMessage = 'x'.repeat(200);
    const context = {
      todayConversations: [
        {
          id: '1',
          timestamp: '2026-02-06T10:30:00Z',
          sessionId: 'test',
          userMessage: longMessage,
          assistantResponse: longMessage,
        },
      ],
      relevantMemories: [],
    };
    const formatted = formatMemoryContext(context);
    expect(formatted).toContain('...');
    // 截断后应该比原始消息短很多（原始 200*2=400，截断后 100+150=250 左右）
    expect(formatted).not.toContain(longMessage);
  });

  test('limits to 5 recent conversations', () => {
    const conversations = Array.from({ length: 10 }, (_, i) => ({
      id: String(i),
      timestamp: `2026-02-06T${10 + i}:00:00Z`,
      sessionId: 'test',
      userMessage: `Message ${i}`,
      assistantResponse: `Response ${i}`,
    }));
    const context = {
      todayConversations: conversations,
      relevantMemories: [],
    };
    const formatted = formatMemoryContext(context);
    // 应该只包含最后 5 条
    expect(formatted).toContain('Message 5');
    expect(formatted).toContain('Message 9');
    expect(formatted).not.toContain('Message 0');
    expect(formatted).not.toContain('Message 4');
  });

  test('combines all memory layers', () => {
    const context = {
      todayConversations: [
        {
          id: '1',
          timestamp: '2026-02-06T10:30:00Z',
          sessionId: 'test',
          userMessage: 'Test',
          assistantResponse: 'OK',
        },
      ],
      relevantMemories: ['User Profile: Tester'],
      extracted: {
        decisions: ['Decision A'],
        facts: [],
        preferences: [],
        runtime: [],
      },
    };
    const formatted = formatMemoryContext(context);
    expect(formatted).toContain('Long-term Memory (L2)');
    expect(formatted).toContain('Extracted Memory (L1)');
    expect(formatted).toContain("Today's Conversations (L0");
  });
});
