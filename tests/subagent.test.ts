/**
 * Subagent 单元测试
 */

import { describe, test, expect } from 'bun:test';
import {
  SubagentRunner,
  type SubagentTask,
  type SubagentResult,
} from '../src/agent/subagent.ts';

describe('SubagentRunner', () => {
  describe('mergeResults', () => {
    test('returns empty string for no results', () => {
      expect(SubagentRunner.mergeResults([])).toBe('');
    });

    test('formats single successful result', () => {
      const results: SubagentResult[] = [
        {
          taskId: 'task-1',
          success: true,
          summary: 'Found 3 matching files',
          findings: ['file1.ts', 'file2.ts', 'file3.ts'],
          confidence: 0.9,
          durationMs: 1200,
        },
      ];

      const merged = SubagentRunner.mergeResults(results);
      expect(merged).toContain('## Subagent Results');
      expect(merged).toContain('[✓] Task task-1');
      expect(merged).toContain('90% confidence');
      expect(merged).toContain('Found 3 matching files');
      expect(merged).toContain('file1.ts');
    });

    test('formats failed result with ✗', () => {
      const results: SubagentResult[] = [
        {
          taskId: 'task-2',
          success: false,
          summary: 'Task failed: timeout',
          findings: [],
          confidence: 0,
          durationMs: 5000,
        },
      ];

      const merged = SubagentRunner.mergeResults(results);
      expect(merged).toContain('[✗] Task task-2');
      expect(merged).toContain('0% confidence');
    });

    test('formats multiple results with separators', () => {
      const results: SubagentResult[] = [
        {
          taskId: 'search-1',
          success: true,
          summary: 'Search complete',
          findings: ['result A'],
          confidence: 0.8,
          durationMs: 500,
        },
        {
          taskId: 'verify-1',
          success: true,
          summary: 'Verification passed',
          findings: ['all checks OK'],
          confidence: 0.95,
          nextActions: ['proceed to deploy'],
          durationMs: 300,
        },
      ];

      const merged = SubagentRunner.mergeResults(results);
      expect(merged).toContain('search-1');
      expect(merged).toContain('verify-1');
      expect(merged).toContain('---');
      expect(merged).toContain('proceed to deploy');
    });

    test('includes nextActions when present', () => {
      const results: SubagentResult[] = [
        {
          taskId: 'task-3',
          success: true,
          summary: 'Analysis done',
          findings: [],
          confidence: 0.7,
          nextActions: ['review code', 'run tests'],
          durationMs: 800,
        },
      ];

      const merged = SubagentRunner.mergeResults(results);
      expect(merged).toContain('Suggested:');
      expect(merged).toContain('review code');
      expect(merged).toContain('run tests');
    });
  });
});
