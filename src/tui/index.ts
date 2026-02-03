/**
 * TUI (Terminal User Interface) 模块
 * 
 * 提供终端用户界面增强功能：
 * - 流式输出
 * - 工具调用状态显示
 * - 彩色输出
 * - 格式化输出
 */

export { ToolSpinner } from './spinner.ts';
export { StreamWriter, formatToolCall, formatToolResult } from './stream.ts';
