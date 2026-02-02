import { readFile, writeFile } from 'fs/promises';
import type { ToolDef, ToolResult } from './registry.ts';

/**
 * edit_file 工具 - 精确编辑文件
 */
export const editFileTool: ToolDef = {
  name: 'edit_file',
  description: '精确编辑文件内容。支持搜索替换。',
  schema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: '文件路径',
      },
      search: {
        type: 'string',
        description: '要搜索的文本',
      },
      replace: {
        type: 'string',
        description: '替换为的文本',
      },
      all: {
        type: 'boolean',
        description: '是否替换所有匹配，默认 false',
      },
    },
    required: ['path', 'search', 'replace'],
  },

  async execute(params): Promise<ToolResult> {
    const { path, search, replace, all = false } = params;

    try {
      let content = await readFile(path, 'utf-8');
      const before = content;

      if (all) {
        content = content.replaceAll(search, replace);
      } else {
        content = content.replace(search, replace);
      }

      const changed = content !== before;

      if (changed) {
        await writeFile(path, content, 'utf-8');
      }

      return {
        success: true,
        data: {
          changed,
        },
      };
    } catch (error: any) {
      return {
        success: false,
        error: `Failed to edit file: ${error.message}`,
      };
    }
  },
};
