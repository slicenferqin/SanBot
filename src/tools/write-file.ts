import { mkdir, writeFile, appendFile } from 'fs/promises';
import { dirname } from 'path';
import type { ToolDef, ToolResult } from './registry.ts';

/**
 * write_file 工具 - 写入文件
 */
export const writeFileTool: ToolDef = {
  name: 'write_file',
  description: '写入文件，自动创建目录。支持覆盖或追加模式。',
  schema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: '文件路径',
      },
      content: {
        type: 'string',
        description: '文件内容',
      },
      mode: {
        type: 'string',
        enum: ['overwrite', 'append'],
        description: '写入模式，默认 overwrite',
      },
    },
    required: ['path', 'content'],
  },

  async execute(params): Promise<ToolResult> {
    const { path, content, mode = 'overwrite' } = params;

    try {
      const dir = dirname(path);
      await mkdir(dir, { recursive: true });

      if (mode === 'append') {
        await appendFile(path, content, 'utf-8');
      } else {
        await writeFile(path, content, 'utf-8');
      }

      const bytesWritten = Buffer.byteLength(content, 'utf-8');

      return {
        success: true,
        data: {
          bytesWritten,
          mode,
        },
      };
    } catch (error: any) {
      return {
        success: false,
        error: `Failed to write file: ${error.message}`,
      };
    }
  },
};
