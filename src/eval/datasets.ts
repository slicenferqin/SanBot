/**
 * 预定义评测集
 *
 * 难度分层：
 * - L1: 单步可解
 * - L2: 多步协作
 * - L3: 高不确定 + 外部依赖
 */

import type { EvalSet, EvalCase } from './types.ts';

/**
 * 基础评测集 - L1 单步任务
 */
export const basicEvalSet: EvalSet = {
  name: 'basic',
  description: '基础单步任务评测',
  version: '1.0.0',
  cases: [
    {
      id: 'basic-001',
      name: '列出当前目录文件',
      level: 'L1',
      tags: ['file', 'list'],
      input: '列出当前目录下的所有文件',
      expectedTools: ['list_dir'],
      verifier: {
        type: 'contains',
        mustContain: ['package.json', 'src'],
      },
    },
    {
      id: 'basic-002',
      name: '读取 package.json',
      level: 'L1',
      tags: ['file', 'read'],
      input: '读取 package.json 文件的内容',
      expectedTools: ['read_file'],
      verifier: {
        type: 'contains',
        mustContain: ['name', 'version'],
      },
    },
    {
      id: 'basic-003',
      name: '执行简单命令',
      level: 'L1',
      tags: ['exec'],
      input: '执行 echo "hello world" 命令',
      expectedTools: ['exec'],
      verifier: {
        type: 'contains',
        mustContain: ['hello world'],
      },
    },
    {
      id: 'basic-004',
      name: '获取 Git 状态',
      level: 'L1',
      tags: ['git'],
      input: '显示当前 Git 仓库的状态',
      expectedTools: ['git_status'],
      verifier: {
        type: 'contains',
        mustContain: ['branch'],
      },
    },
    {
      id: 'basic-005',
      name: '搜索 TypeScript 文件',
      level: 'L1',
      tags: ['search'],
      input: '搜索所有 .ts 文件',
      expectedTools: ['search_codebase'],
      verifier: {
        type: 'contains',
        mustContain: ['.ts'],
      },
    },
  ],
};

/**
 * 中级评测集 - L2 多步任务
 */
export const intermediateEvalSet: EvalSet = {
  name: 'intermediate',
  description: '中级多步任务评测',
  version: '1.0.0',
  cases: [
    {
      id: 'inter-001',
      name: '分析项目依赖',
      level: 'L2',
      tags: ['analysis', 'dependencies'],
      input: '分析这个项目的依赖，告诉我主要使用了哪些库',
      verifier: {
        type: 'contains',
        mustContain: ['anthropic', 'bun'],
      },
    },
    {
      id: 'inter-002',
      name: '查找并读取配置',
      level: 'L2',
      tags: ['search', 'read'],
      input: '找到项目的配置文件并告诉我 LLM 的默认配置',
      verifier: {
        type: 'contains',
        mustContain: ['provider', 'model'],
      },
    },
    {
      id: 'inter-003',
      name: '代码搜索和分析',
      level: 'L2',
      tags: ['search', 'analysis'],
      input: '找到 Agent 类的定义，告诉我它有哪些主要方法',
      verifier: {
        type: 'contains',
        mustContain: ['chat', 'init'],
      },
    },
    {
      id: 'inter-004',
      name: 'Git 历史分析',
      level: 'L2',
      tags: ['git', 'analysis'],
      input: '查看最近的 Git 提交，总结最近做了什么改动',
      verifier: {
        type: 'llm',
        criteria: 'Response should summarize recent git commits',
        threshold: 0.6,
      },
    },
    {
      id: 'inter-005',
      name: '运行测试并报告',
      level: 'L2',
      tags: ['test', 'report'],
      input: '运行项目测试并告诉我结果',
      expectedTools: ['run_tests'],
      verifier: {
        type: 'contains',
        mustContain: ['pass'],
      },
      timeout: 120000,
    },
  ],
};

/**
 * 高级评测集 - L3 复杂任务
 */
export const advancedEvalSet: EvalSet = {
  name: 'advanced',
  description: '高级复杂任务评测',
  version: '1.0.0',
  cases: [
    {
      id: 'adv-001',
      name: '项目架构分析',
      level: 'L3',
      tags: ['architecture', 'analysis'],
      input: '分析这个项目的整体架构，包括目录结构、主要模块和它们之间的关系',
      verifier: {
        type: 'llm',
        criteria: 'Response should provide comprehensive architecture analysis',
        threshold: 0.7,
      },
      timeout: 180000,
    },
    {
      id: 'adv-002',
      name: '代码质量评估',
      level: 'L3',
      tags: ['quality', 'analysis'],
      input: '评估这个项目的代码质量，指出可能的改进点',
      verifier: {
        type: 'llm',
        criteria: 'Response should identify code quality issues and suggestions',
        threshold: 0.6,
      },
      timeout: 180000,
    },
    {
      id: 'adv-003',
      name: '功能实现建议',
      level: 'L3',
      tags: ['design', 'suggestion'],
      input: '如果要给这个项目添加一个"对话历史导出"功能，你会怎么设计？',
      verifier: {
        type: 'llm',
        criteria: 'Response should provide a reasonable design proposal',
        threshold: 0.6,
      },
    },
  ],
};

/**
 * Holdout 评测集 - 保留集
 */
export const holdoutEvalSet: EvalSet = {
  name: 'holdout',
  description: '保留评测集（用于验证泛化能力）',
  version: '1.0.0',
  cases: [
    {
      id: 'hold-001',
      name: '未见任务 1',
      level: 'L2',
      tags: ['holdout'],
      input: '找到所有导出函数并列出它们的名称',
      verifier: {
        type: 'contains',
        mustContain: ['export'],
      },
      isHoldout: true,
    },
    {
      id: 'hold-002',
      name: '未见任务 2',
      level: 'L2',
      tags: ['holdout'],
      input: '统计这个项目有多少行 TypeScript 代码',
      verifier: {
        type: 'llm',
        criteria: 'Response should contain a line count number',
        threshold: 0.5,
      },
      isHoldout: true,
    },
    {
      id: 'hold-003',
      name: '未见任务 3',
      level: 'L3',
      tags: ['holdout'],
      input: '比较 Agent 类和 SubagentRunner 类的设计差异',
      verifier: {
        type: 'llm',
        criteria: 'Response should compare the two classes',
        threshold: 0.6,
      },
      isHoldout: true,
    },
  ],
};

/**
 * 获取所有评测集
 */
export function getAllEvalSets(): EvalSet[] {
  return [basicEvalSet, intermediateEvalSet, advancedEvalSet, holdoutEvalSet];
}

/**
 * 合并评测集
 */
export function mergeEvalSets(sets: EvalSet[]): EvalSet {
  return {
    name: 'merged',
    description: 'Merged eval set',
    version: '1.0.0',
    cases: sets.flatMap((s) => s.cases),
  };
}

/**
 * 按级别过滤
 */
export function filterByLevel(evalSet: EvalSet, level: 'L1' | 'L2' | 'L3'): EvalSet {
  return {
    ...evalSet,
    cases: evalSet.cases.filter((c) => c.level === level),
  };
}

/**
 * 按标签过滤
 */
export function filterByTag(evalSet: EvalSet, tag: string): EvalSet {
  return {
    ...evalSet,
    cases: evalSet.cases.filter((c) => c.tags.includes(tag)),
  };
}
