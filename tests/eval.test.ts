/**
 * Eval 模块单元测试
 */

import { describe, test, expect } from 'bun:test';
import {
  basicEvalSet,
  intermediateEvalSet,
  advancedEvalSet,
  holdoutEvalSet,
  getAllEvalSets,
  mergeEvalSets,
  filterByLevel,
  filterByTag,
} from '../src/eval/datasets.ts';
import { verify } from '../src/eval/verifier.ts';
import { attributeFailure } from '../src/eval/failure.ts';
import type { EvalCase, ToolCallRecord } from '../src/eval/types.ts';

describe('Eval Datasets', () => {
  describe('basicEvalSet', () => {
    test('has correct structure', () => {
      expect(basicEvalSet.name).toBe('basic');
      expect(basicEvalSet.cases.length).toBeGreaterThan(0);
    });

    test('all cases are L1', () => {
      for (const c of basicEvalSet.cases) {
        expect(c.level).toBe('L1');
      }
    });

    test('all cases have required fields', () => {
      for (const c of basicEvalSet.cases) {
        expect(c.id).toBeTruthy();
        expect(c.name).toBeTruthy();
        expect(c.input).toBeTruthy();
        expect(c.verifier).toBeTruthy();
      }
    });
  });

  describe('intermediateEvalSet', () => {
    test('all cases are L2', () => {
      for (const c of intermediateEvalSet.cases) {
        expect(c.level).toBe('L2');
      }
    });
  });

  describe('advancedEvalSet', () => {
    test('all cases are L3', () => {
      for (const c of advancedEvalSet.cases) {
        expect(c.level).toBe('L3');
      }
    });
  });

  describe('holdoutEvalSet', () => {
    test('all cases are marked as holdout', () => {
      for (const c of holdoutEvalSet.cases) {
        expect(c.isHoldout).toBe(true);
      }
    });
  });

  describe('getAllEvalSets', () => {
    test('returns all eval sets', () => {
      const sets = getAllEvalSets();
      expect(sets.length).toBe(4);
    });
  });

  describe('mergeEvalSets', () => {
    test('merges multiple sets', () => {
      const merged = mergeEvalSets([basicEvalSet, intermediateEvalSet]);
      expect(merged.cases.length).toBe(
        basicEvalSet.cases.length + intermediateEvalSet.cases.length
      );
    });
  });

  describe('filterByLevel', () => {
    test('filters by level', () => {
      const merged = mergeEvalSets([basicEvalSet, intermediateEvalSet]);
      const l1Only = filterByLevel(merged, 'L1');
      expect(l1Only.cases.every((c) => c.level === 'L1')).toBe(true);
    });
  });

  describe('filterByTag', () => {
    test('filters by tag', () => {
      const filtered = filterByTag(basicEvalSet, 'file');
      expect(filtered.cases.every((c) => c.tags.includes('file'))).toBe(true);
    });
  });
});

describe('Verifier', () => {
  describe('exact_match', () => {
    test('passes on exact match', async () => {
      const result = await verify(
        { type: 'exact_match', expected: 'hello world' },
        'hello world',
        []
      );
      expect(result.passed).toBe(true);
    });

    test('fails on mismatch', async () => {
      const result = await verify(
        { type: 'exact_match', expected: 'hello world' },
        'hello there',
        []
      );
      expect(result.passed).toBe(false);
    });

    test('is case insensitive', async () => {
      const result = await verify(
        { type: 'exact_match', expected: 'Hello World' },
        'hello world',
        []
      );
      expect(result.passed).toBe(true);
    });
  });

  describe('contains', () => {
    test('passes when all required content present', async () => {
      const result = await verify(
        { type: 'contains', mustContain: ['foo', 'bar'] },
        'this has foo and bar in it',
        []
      );
      expect(result.passed).toBe(true);
    });

    test('fails when required content missing', async () => {
      const result = await verify(
        { type: 'contains', mustContain: ['foo', 'bar'] },
        'this only has foo',
        []
      );
      expect(result.passed).toBe(false);
    });

    test('fails when forbidden content present', async () => {
      const result = await verify(
        { type: 'contains', mustContain: ['foo'], mustNotContain: ['error'] },
        'foo but also error',
        []
      );
      expect(result.passed).toBe(false);
    });
  });

  describe('schema', () => {
    test('passes valid JSON', async () => {
      const result = await verify(
        {
          type: 'schema',
          schema: {
            type: 'object',
            properties: { name: { type: 'string' } },
            required: ['name'],
          },
        },
        '{"name": "test"}',
        []
      );
      expect(result.passed).toBe(true);
    });

    test('fails missing required field', async () => {
      const result = await verify(
        {
          type: 'schema',
          schema: {
            type: 'object',
            required: ['name'],
          },
        },
        '{"other": "value"}',
        []
      );
      expect(result.passed).toBe(false);
    });

    test('extracts JSON from code block', async () => {
      const result = await verify(
        {
          type: 'schema',
          schema: { type: 'object', required: ['name'] },
        },
        'Here is the result:\n```json\n{"name": "test"}\n```',
        []
      );
      expect(result.passed).toBe(true);
    });
  });

  describe('custom', () => {
    test('used_exec passes when exec used', async () => {
      const toolCalls: ToolCallRecord[] = [
        { name: 'exec', input: {}, output: {}, success: true, durationMs: 100 },
      ];
      const result = await verify({ type: 'custom', fn: 'used_exec' }, '', toolCalls);
      expect(result.passed).toBe(true);
    });

    test('used_exec fails when exec not used', async () => {
      const result = await verify({ type: 'custom', fn: 'used_exec' }, '', []);
      expect(result.passed).toBe(false);
    });

    test('valid_code passes with code block', async () => {
      const result = await verify(
        { type: 'custom', fn: 'valid_code' },
        '```typescript\nconst x = 1;\n```',
        []
      );
      expect(result.passed).toBe(true);
    });
  });

  describe('llm', () => {
    test('passes above threshold', async () => {
      const result = await verify(
        { type: 'llm', criteria: 'test', threshold: 0.5 },
        'This is a long response with code ```js\nconst x = 1;\n``` and numbers 123',
        []
      );
      expect(result.passed).toBe(true);
    });
  });
});

describe('Failure Attribution', () => {
  test('attributes tool failure', () => {
    const evalCase: EvalCase = {
      id: 'test',
      name: 'test',
      level: 'L1',
      tags: [],
      input: 'test',
      verifier: { type: 'contains', mustContain: ['x'] },
    };
    const toolCalls: ToolCallRecord[] = [
      { name: 'exec', input: {}, output: {}, success: false, durationMs: 100 },
    ];
    const result = attributeFailure(
      evalCase,
      'output',
      toolCalls,
      { passed: false, reason: 'test' }
    );
    expect(result.type).toBe('tool');
  });

  test('attributes tool failure when expected tools not used', () => {
    const evalCase: EvalCase = {
      id: 'test',
      name: 'test',
      level: 'L1',
      tags: [],
      input: 'test',
      expectedTools: ['exec'],
      verifier: { type: 'contains', mustContain: ['x'] },
    };
    const result = attributeFailure(
      evalCase,
      'some output without tools',
      [],
      { passed: false, reason: 'test' }
    );
    // When expected tools are not used, it's a tool selection failure
    expect(result.type).toBe('tool');
  });

  test('attributes context failure when output indicates missing info', () => {
    const evalCase: EvalCase = {
      id: 'test',
      name: 'test',
      level: 'L1',
      tags: [],
      input: 'test',
      verifier: { type: 'contains', mustContain: ['x'] },
    };
    const result = attributeFailure(
      evalCase,
      'I cannot access that information',
      [],
      { passed: false, reason: 'test' }
    );
    expect(result.type).toBe('context');
  });

  test('defaults to reasoning failure', () => {
    const evalCase: EvalCase = {
      id: 'test',
      name: 'test',
      level: 'L1',
      tags: [],
      input: 'test',
      verifier: { type: 'contains', mustContain: ['x'] },
    };
    const result = attributeFailure(
      evalCase,
      'some output',
      [],
      { passed: false, reason: 'test' }
    );
    expect(result.type).toBe('reasoning');
  });
});
