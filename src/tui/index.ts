/**
 * TUI (Terminal User Interface) 模块
 *
 * 提供终端用户界面相关功能：
 * - 流式输出
 * - 工具调用状态显示
 * - 彩色输出系统
 * - Markdown 渲染
 * - 错误处理美化
 * - 提示符和界面组件
 */

export { StreamWriter, formatToolCall, formatToolResult } from './stream.ts';
export type { StreamWriterInterface } from './stream.ts';
export { ToolSpinner } from './spinner.ts';
export type { ToolSpinnerInterface } from './spinner.ts';
export { ColorSystem, colors } from './colors.ts';
export { MarkdownRenderer, markdown } from './markdown.ts';
export { ErrorHandler, errorHandler, ErrorType, type ErrorInfo } from './error.ts';
export { Prompt } from './prompt.ts';
