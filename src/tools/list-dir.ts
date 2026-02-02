import { readdir, stat } from 'fs/promises';
import { join } from 'path';
import type { ToolDef, ToolResult } from './registry.ts';

/**
 * list_dir 工具 - 列出目录内容
 */
export const listDirTool: ToolDef = {
  name: 'list_dir',
  description: '列出目录内容，结构化输出。支持递归和 glob 过滤。',
  schema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: '目录路径',
      },
      recursive: {
        type: 'boolean',
        description: '是否递归，默认 false',
      },
      maxDepth: {
        type: 'number',
        description: '最大递归深度，默认 3',
      },
      pattern: {
        type: 'string',
        description: 'glob 过滤模式，如 *.ts',
      },
    },
    required: ['path'],
  },

  async execute(params): Promise<ToolResult> {
    const { path, recursive = false, maxDepth = 3, pattern } = params;

    try {
      const entries = await listDirectory(path, recursive, maxDepth, 0, pattern);

      return {
        success: true,
        data: {
          entries,
        },
      };
    } catch (error: any) {
      return {
        success: false,
        error: `Failed to list directory: ${error.message}`,
      };
    }
  },
};

async function listDirectory(
  dirPath: string,
  recursive: boolean,
  maxDepth: number,
  currentDepth: number,
  pattern?: string
): Promise<any[]> {
  const entries: any[] = [];
  const items = await readdir(dirPath);

  for (const item of items) {
    const fullPath = join(dirPath, item);
    const stats = await stat(fullPath);

    if (pattern && !matchPattern(item, pattern)) {
      continue;
    }

    const entry = {
      name: item,
      type: stats.isDirectory()
        ? 'directory'
        : stats.isSymbolicLink()
        ? 'symlink'
        : 'file',
      size: stats.size,
      modified: stats.mtime.toISOString(),
    };

    entries.push(entry);

    if (recursive && stats.isDirectory() && currentDepth < maxDepth) {
      const subEntries = await listDirectory(
        fullPath,
        recursive,
        maxDepth,
        currentDepth + 1,
        pattern
      );
      entries.push(...subEntries.map((e) => ({ ...e, name: `${item}/${e.name}` })));
    }
  }

  return entries;
}

function matchPattern(name: string, pattern: string): boolean {
  const regex = new RegExp(
    '^' + pattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$'
  );
  return regex.test(name);
}
