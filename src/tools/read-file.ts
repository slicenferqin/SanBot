import { readFile } from 'fs/promises';
import type { ToolDef, ToolResult } from './registry.ts';
import { recordContextEvent } from '../context/tracker.ts';

/**
 * read_file 工具 - 读取文件内容
 */
export const readFileTool: ToolDef = {
  name: 'read_file',
  description:
    '读取文件内容，支持分页避免 context 爆炸。返回文件内容、总行数、是否被截断。',
  schema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: '文件路径',
      },
      startLine: {
        type: 'number',
        description: '起始行号（1-based），默认 1',
      },
      endLine: {
        type: 'number',
        description: '结束行号，默认读到文件末尾',
      },
      maxLines: {
        type: 'number',
        description: '最大行数，默认 500',
      },
    },
    required: ['path'],
  },

  async execute(params): Promise<ToolResult> {
    const { path, startLine = 1, endLine, maxLines = 500 } = params;

    try {
      const content = await readFile(path, 'utf-8');
      const lines = content.split('\n');
      const totalLines = lines.length;

      const start = Math.max(0, startLine - 1);
      const end = endLine ? Math.min(endLine, totalLines) : totalLines;
      const actualEnd = Math.min(end, start + maxLines);

      const selectedLines = lines.slice(start, actualEnd);
      const resultContent = selectedLines.join('\n');

      const response = {
        success: true,
        data: {
          content: resultContent,
          totalLines,
          truncated: actualEnd < end || actualEnd < totalLines,
          startLine: start + 1,
          endLine: actualEnd,
        },
      };
      await recordContextEvent({
        source: 'read_file',
        summary: `${path} (${start + 1}-${actualEnd})`,
        detail: truncatedMessage(start + 1, actualEnd, totalLines, resultContent.length),
      });
      return response;
    } catch (error: any) {
      await recordContextEvent({
        source: 'read_file',
        summary: `Failed to read ${path}`,
        detail: error.message,
      });
      return {
        success: false,
        error: `Failed to read file: ${error.message}`,
      };
    }
  },
};

function truncatedMessage(start: number, end: number, total: number, chars: number): string {
  const truncated = end < total ? 'truncated' : 'full';
  return `${start}-${end} of ${total} lines (${truncated}, ${chars} chars)`;
}
