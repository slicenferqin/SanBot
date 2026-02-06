/**
 * 业务工具单元测试
 */

import { describe, test, expect } from 'bun:test';
import {
  searchCodebaseTool,
  runTestsTool,
  gitStatusTool,
  analyzeProjectTool,
  batchFileOpTool,
  getBusinessTools,
} from '../src/tools/business.ts';

describe('Business Tools', () => {
  describe('getBusinessTools', () => {
    test('returns all business tools', () => {
      const tools = getBusinessTools();
      expect(tools.length).toBe(5);
      expect(tools.map((t) => t.name)).toContain('search_codebase');
      expect(tools.map((t) => t.name)).toContain('run_tests');
      expect(tools.map((t) => t.name)).toContain('git_status');
      expect(tools.map((t) => t.name)).toContain('analyze_project');
      expect(tools.map((t) => t.name)).toContain('batch_file_op');
    });
  });

  describe('searchCodebaseTool', () => {
    test('has correct schema', () => {
      expect(searchCodebaseTool.name).toBe('search_codebase');
      expect(searchCodebaseTool.schema.properties).toHaveProperty('pattern');
      expect(searchCodebaseTool.schema.properties).toHaveProperty('type');
      expect(searchCodebaseTool.schema.required).toContain('pattern');
      expect(searchCodebaseTool.schema.required).toContain('type');
    });

    test('searches by filename', async () => {
      const result = await searchCodebaseTool.execute({
        pattern: '*.ts',
        type: 'filename',
        path: 'src',
        maxResults: 5,
      });
      expect(result.success).toBe(true);
      expect(result.data?.type).toBe('filename');
      expect(result.data?.files).toBeDefined();
    });

    test('searches by content', async () => {
      const result = await searchCodebaseTool.execute({
        pattern: 'export',
        type: 'content',
        path: 'src',
        maxResults: 5,
      });
      expect(result.success).toBe(true);
      expect(result.data?.type).toBe('content');
    });
  });

  describe('gitStatusTool', () => {
    test('has correct schema', () => {
      expect(gitStatusTool.name).toBe('git_status');
      expect(gitStatusTool.schema.properties).toHaveProperty('showDiff');
    });

    test('returns git status', async () => {
      const result = await gitStatusTool.execute({});
      expect(result.success).toBe(true);
      expect(result.data?.branch).toBeDefined();
      expect(result.data?.files).toBeDefined();
    });

    test('includes diff when requested', async () => {
      const result = await gitStatusTool.execute({ showDiff: true });
      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('diff');
    });
  });

  describe('analyzeProjectTool', () => {
    test('has correct schema', () => {
      expect(analyzeProjectTool.name).toBe('analyze_project');
      expect(analyzeProjectTool.schema.properties).toHaveProperty('depth');
    });

    test('analyzes project structure', async () => {
      const result = await analyzeProjectTool.execute({ depth: 1 });
      expect(result.success).toBe(true);
      expect(result.data?.files).toBeDefined();
      expect(result.data?.dependencies).toBeDefined();
    });
  });

  describe('batchFileOpTool', () => {
    test('has correct schema', () => {
      expect(batchFileOpTool.name).toBe('batch_file_op');
      expect(batchFileOpTool.schema.properties).toHaveProperty('operation');
      expect(batchFileOpTool.schema.properties).toHaveProperty('pattern');
      expect(batchFileOpTool.schema.required).toContain('operation');
      expect(batchFileOpTool.schema.required).toContain('pattern');
    });

    test('dry run returns preview', async () => {
      const result = await batchFileOpTool.execute({
        operation: 'delete',
        pattern: '*.nonexistent',
        dryRun: true,
      });
      expect(result.success).toBe(true);
      // Either no files matched or dry run preview
      expect(result.data?.dryRun === true || result.data?.message === 'No files matched').toBe(true);
    });
  });

  describe('runTestsTool', () => {
    test('has correct schema', () => {
      expect(runTestsTool.name).toBe('run_tests');
      expect(runTestsTool.schema.properties).toHaveProperty('path');
      expect(runTestsTool.schema.properties).toHaveProperty('filter');
    });

    // Note: Actually running tests would be recursive, so we just test the schema
  });
});
