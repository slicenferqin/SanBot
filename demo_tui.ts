#!/usr/bin/env bun

/**
 * TUI 功能演示脚本
 */

import { colors, markdown, errorHandler, ErrorType, Prompt, ErrorHandler } from './src/tui/index.ts';

console.log('\n' + '='.repeat(60));
console.log('  TUI 功能演示');
console.log('='.repeat(60) + '\n');

// 1. 彩色输出系统
console.log(colors.bold('1. 彩色输出系统\n'));
console.log(colors.user('用户输入: ') + 'Hello, SanBot!');
console.log(colors.ai('AI 响应: ') + 'Hello! How can I help you today?');
console.log(colors.tool('工具调用: ') + 'exec: ls -la');
console.log(colors.success('成功: ') + 'Operation completed successfully');
console.log(colors.error('错误: ') + 'Something went wrong');
console.log(colors.warning('警告: ') + 'This operation may take a while');
console.log(colors.system('系统: ') + 'Loading configuration...');
console.log(colors.code(' const x = 42; ') + ' - 内联代码');
console.log(colors.link('https://github.com/sanbot') + ' - 链接');
console.log('');

// 2. Markdown 渲染
console.log(colors.bold('2. Markdown 渲染\n'));

const markdownText = `
# 这是一个标题

这是一个段落，包含 **粗体** 和 *斜体* 文本。

## 代码示例

这是一个 TypeScript 代码块：

\`\`\`typescript
function greet(name: string): string {
  return \`Hello, \${name}!\`;
}

const message = greet('SanBot');
console.log(message);
\`\`\`

## 列表

- 第一项
- 第二项
- 第三项

## 引用

> 这是一个引用块
> 可以包含多行文本

## 链接

访问 [SanBot GitHub](https://github.com/sanbot) 了解更多。

---

这是一个水平分隔线。
`;

console.log(markdown.render(markdownText));

// 3. 错误处理美化
console.log(colors.bold('3. 错误处理美化\n'));

// 模拟不同类型的错误
const errors = [
  errorHandler.format(
    ErrorHandler.create(
      ErrorType.RATE_LIMIT,
      'Rate limit exceeded',
      '429 Too Many Requests',
      [
        'Wait a moment and try again',
        'Check your API quota',
        'Consider upgrading your plan',
      ]
    )
  ),
  errorHandler.format(
    ErrorHandler.create(
      ErrorType.AUTH_ERROR,
      'Authentication failed',
      '401 Unauthorized',
      [
        'Check your API key is correct',
        'Verify the API key has not expired',
      ]
    )
  ),
];

errors.forEach(err => console.log(err));

// 4. 提示符和界面组件
console.log(colors.bold('4. 提示符和界面组件\n'));

Prompt.welcome();
Prompt.system('This is a system message');
Prompt.success('Operation completed successfully');
Prompt.warning('This is a warning message');
Prompt.error('This is an error message');
Prompt.separator();

// 5. 会话统计
console.log(colors.bold('5. 会话统计\n'));
Prompt.stats({
  duration: 154000, // 2m 34s
  toolCalls: 5,
  tokensIn: 1200,
  tokensOut: 800,
});

console.log(colors.bold('演示完成！\n'));
console.log(colors.system('运行 "bun run src/index.ts" 体验完整的交互式界面。\n'));
