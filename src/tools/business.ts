/**
 * 业务工具封装层
 *
 * 在 MCP 底层连接之上，提供高层业务语义工具。
 * 模型无需逐条调用底层 API，直接使用业务工具完成任务。
 */

import type { ToolDef, ToolResult, JsonSchema } from '../tools/registry.ts';
import { $ } from 'bun';

/**
 * 代码搜索工具 - 在代码库中搜索
 */
export const searchCodebaseTool: ToolDef = {
  name: 'search_codebase',
  description: '在代码库中搜索文件或内容。支持文件名模式匹配和内容搜索。',
  schema: {
    type: 'object',
    properties: {
      pattern: {
        type: 'string',
        description: '搜索模式：文件名 glob 模式（如 "*.ts"）或内容正则表达式',
      },
      type: {
        type: 'string',
        enum: ['filename', 'content'],
        description: '搜索类型：filename（文件名）或 content（内容）',
      },
      path: {
        type: 'string',
        description: '搜索路径，默认为当前目录',
      },
      maxResults: {
        type: 'number',
        description: '最大结果数，默认 20',
      },
    },
    required: ['pattern', 'type'],
  },

  async execute(params): Promise<ToolResult> {
    const { pattern, type, path = '.', maxResults = 20 } = params;

    try {
      let results: string[] = [];

      if (type === 'filename') {
        // 使用 find 搜索文件名
        const output = await $`find ${path} -name "${pattern}" -type f 2>/dev/null | head -${maxResults}`.text();
        results = output.trim().split('\n').filter(Boolean);
      } else {
        // 使用 grep 搜索内容
        const output = await $`grep -rl "${pattern}" ${path} 2>/dev/null | head -${maxResults}`.text();
        results = output.trim().split('\n').filter(Boolean);
      }

      return {
        success: true,
        data: {
          pattern,
          type,
          count: results.length,
          files: results,
        },
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  },
};

/**
 * 运行测试工具
 */
export const runTestsTool: ToolDef = {
  name: 'run_tests',
  description: '运行项目测试。自动检测测试框架（bun test, npm test, pytest 等）。',
  schema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: '测试路径或文件，默认运行所有测试',
      },
      filter: {
        type: 'string',
        description: '测试过滤器（测试名称模式）',
      },
      verbose: {
        type: 'boolean',
        description: '是否显示详细输出',
      },
    },
  },

  async execute(params): Promise<ToolResult> {
    const { path, filter, verbose } = params;

    try {
      // 检测测试框架
      const framework = await detectTestFramework();

      let command: string;
      switch (framework) {
        case 'bun':
          command = `bun test ${path || ''} ${filter ? `--filter "${filter}"` : ''}`;
          break;
        case 'npm':
          command = `npm test ${path ? `-- ${path}` : ''}`;
          break;
        case 'pytest':
          command = `pytest ${path || ''} ${filter ? `-k "${filter}"` : ''} ${verbose ? '-v' : ''}`;
          break;
        default:
          return {
            success: false,
            error: 'No test framework detected',
          };
      }

      const result = await $`sh -c ${command}`.quiet();
      const output = await result.text();

      return {
        success: result.exitCode === 0,
        data: {
          framework,
          exitCode: result.exitCode,
          output: output.slice(0, 5000),
        },
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        data: {
          stderr: error.stderr?.toString()?.slice(0, 2000),
        },
      };
    }
  },
};

/**
 * 检测测试框架
 */
async function detectTestFramework(): Promise<'bun' | 'npm' | 'pytest' | null> {
  try {
    // 检查 package.json
    const pkg = await Bun.file('package.json').json();
    if (pkg.scripts?.test) {
      if (pkg.scripts.test.includes('bun')) return 'bun';
      return 'npm';
    }
    if (pkg.devDependencies?.['bun'] || pkg.dependencies?.['bun']) {
      return 'bun';
    }
  } catch {
    // 没有 package.json
  }

  // 检查 pytest
  try {
    await $`which pytest`.quiet();
    const hasPytest = await $`ls pytest.ini pyproject.toml setup.py 2>/dev/null`.quiet();
    if (hasPytest.exitCode === 0) return 'pytest';
  } catch {
    // 没有 pytest
  }

  return null;
}

/**
 * Git 状态工具
 */
export const gitStatusTool: ToolDef = {
  name: 'git_status',
  description: '获取 Git 仓库状态，包括修改的文件、暂存区、分支信息。',
  schema: {
    type: 'object',
    properties: {
      showDiff: {
        type: 'boolean',
        description: '是否显示差异内容',
      },
      diffFiles: {
        type: 'array',
        items: { type: 'string' },
        description: '要显示差异的特定文件',
      },
    },
  },

  async execute(params): Promise<ToolResult> {
    const { showDiff, diffFiles } = params;

    try {
      // 获取状态
      const status = await $`git status --porcelain`.text();
      const branch = await $`git branch --show-current`.text();
      const lastCommit = await $`git log -1 --oneline`.text();

      const result: any = {
        branch: branch.trim(),
        lastCommit: lastCommit.trim(),
        files: parseGitStatus(status),
      };

      // 获取差异
      if (showDiff) {
        if (diffFiles?.length) {
          result.diff = await $`git diff ${diffFiles.join(' ')}`.text();
        } else {
          result.diff = await $`git diff`.text();
        }
        // 截断过长的差异
        if (result.diff.length > 10000) {
          result.diff = result.diff.slice(0, 10000) + '\n...(truncated)';
        }
      }

      return {
        success: true,
        data: result,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  },
};

/**
 * 解析 git status --porcelain 输出
 */
function parseGitStatus(status: string): Array<{ status: string; file: string }> {
  return status
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => ({
      status: line.slice(0, 2).trim(),
      file: line.slice(3),
    }));
}

/**
 * 项目分析工具
 */
export const analyzeProjectTool: ToolDef = {
  name: 'analyze_project',
  description: '分析项目结构，返回目录结构、依赖、脚本等信息。',
  schema: {
    type: 'object',
    properties: {
      depth: {
        type: 'number',
        description: '目录深度，默认 2',
      },
      includeHidden: {
        type: 'boolean',
        description: '是否包含隐藏文件',
      },
    },
  },

  async execute(params): Promise<ToolResult> {
    const { depth = 2, includeHidden = false } = params;

    try {
      // 目录结构
      const treeCmd = includeHidden
        ? `find . -maxdepth ${depth} -type f | head -50`
        : `find . -maxdepth ${depth} -type f -not -path '*/.*' | head -50`;
      const tree = await $`sh -c ${treeCmd}`.text();

      // 依赖信息
      let dependencies: any = null;
      try {
        const pkg = await Bun.file('package.json').json();
        dependencies = {
          name: pkg.name,
          version: pkg.version,
          scripts: Object.keys(pkg.scripts || {}),
          dependencies: Object.keys(pkg.dependencies || {}),
          devDependencies: Object.keys(pkg.devDependencies || {}),
        };
      } catch {
        // 没有 package.json
      }

      // README 摘要
      let readme: string | null = null;
      try {
        const content = await Bun.file('README.md').text();
        readme = content.slice(0, 500);
      } catch {
        // 没有 README
      }

      return {
        success: true,
        data: {
          files: tree.trim().split('\n').filter(Boolean),
          dependencies,
          readme,
        },
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  },
};

/**
 * 批量文件操作工具
 */
export const batchFileOpTool: ToolDef = {
  name: 'batch_file_op',
  description: '批量文件操作：重命名、移动、复制、删除。',
  schema: {
    type: 'object',
    properties: {
      operation: {
        type: 'string',
        enum: ['rename', 'move', 'copy', 'delete'],
        description: '操作类型',
      },
      pattern: {
        type: 'string',
        description: '文件匹配模式（glob）',
      },
      destination: {
        type: 'string',
        description: '目标路径（rename/move/copy 需要）',
      },
      dryRun: {
        type: 'boolean',
        description: '是否只预览不执行',
      },
    },
    required: ['operation', 'pattern'],
  },

  async execute(params): Promise<ToolResult> {
    const { operation, pattern, destination, dryRun = true } = params;

    try {
      // 查找匹配的文件
      const files = await $`find . -name "${pattern}" -type f`.text();
      const fileList = files.trim().split('\n').filter(Boolean);

      if (fileList.length === 0) {
        return {
          success: true,
          data: {
            message: 'No files matched',
            pattern,
          },
        };
      }

      // 预览模式
      if (dryRun) {
        return {
          success: true,
          data: {
            dryRun: true,
            operation,
            files: fileList,
            destination,
            message: `Would ${operation} ${fileList.length} files`,
          },
        };
      }

      // 执行操作
      let command: string;
      switch (operation) {
        case 'delete':
          command = `find . -name "${pattern}" -type f -delete`;
          break;
        case 'move':
          if (!destination) throw new Error('destination required for move');
          command = `find . -name "${pattern}" -type f -exec mv {} ${destination}/ \\;`;
          break;
        case 'copy':
          if (!destination) throw new Error('destination required for copy');
          command = `find . -name "${pattern}" -type f -exec cp {} ${destination}/ \\;`;
          break;
        default:
          throw new Error(`Unsupported operation: ${operation}`);
      }

      await $`sh -c ${command}`;

      return {
        success: true,
        data: {
          operation,
          filesAffected: fileList.length,
          destination,
        },
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  },
};

/**
 * 获取所有业务工具
 */
export function getBusinessTools(): ToolDef[] {
  return [
    searchCodebaseTool,
    runTestsTool,
    gitStatusTool,
    analyzeProjectTool,
    batchFileOpTool,
  ];
}
