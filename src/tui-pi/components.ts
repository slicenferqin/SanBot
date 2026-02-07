// @ts-nocheck

/**
 * TUI 组件
 * 基于 pi-tui 的 UI 组件封装
 */

import { Box, Container, Markdown, Text } from '@mariozechner/pi-tui';
import type { ChatMessage, ToolCall } from './types';

/**
 * 创建 Header 组件
 */
export function createHeader(sessionId: string, model: string): Container {
  const container = new Container();

  const title = new Text('🤖 SanBot - Autonomous Super-Assistant');
  title.color = 'cyan';
  title.bold = true;

  const info = new Text(`Session: ${sessionId.slice(0, 8)} | Model: ${model}`);
  info.color = 'gray';

  container.append(title);
  container.append(info);

  return container;
}

/**
 * 创建消息组件
 */
export function createMessageComponent(message: ChatMessage): Container {
  const container = new Container();

  // 角色标签
  const roleLabel = new Text(message.role === 'user' ? '👤 You' : '🤖 SanBot');
  roleLabel.color = message.role === 'user' ? 'green' : 'cyan';
  roleLabel.bold = true;

  // 时间戳
  const timestamp = new Text(`  ${message.timestamp.toLocaleTimeString()}`);
  timestamp.color = 'gray';

  const headerContainer = new Container();
  headerContainer.append(roleLabel);
  headerContainer.append(timestamp);

  container.append(headerContainer);

  // 消息内容（使用 Markdown 渲染）
  const content = new Markdown(message.content || '');
  container.append(content);

  return container;
}

/**
 * 创建工具调用组件
 */
export function createToolCallComponent(tool: ToolCall): Box {
  const box = new Box();

  // 根据状态设置背景色
  if (tool.status === 'pending') {
    box.backgroundColor = 'yellow';
    box.foregroundColor = 'black';
  } else if (tool.status === 'success') {
    box.backgroundColor = 'green';
    box.foregroundColor = 'white';
  } else {
    box.backgroundColor = 'red';
    box.foregroundColor = 'white';
  }

  // 工具名称和状态
  const header = new Text(`🔧 ${tool.name} - ${tool.status.toUpperCase()}`);
  header.bold = true;
  box.append(header);

  // 输入参数（简化显示）
  const inputStr = JSON.stringify(tool.input, null, 2);
  const inputPreview = inputStr.length > 100
    ? inputStr.slice(0, 100) + '...'
    : inputStr;
  const input = new Text(`Input: ${inputPreview}`);
  box.append(input);

  // 结果或错误
  if (tool.result) {
    const resultPreview = tool.result.length > 200
      ? tool.result.slice(0, 200) + '...'
      : tool.result;
    const result = new Text(`Result: ${resultPreview}`);
    box.append(result);
  }

  if (tool.error) {
    const error = new Text(`Error: ${tool.error}`);
    error.color = 'red';
    box.append(error);
  }

  // 耗时
  if (tool.endTime) {
    const duration = tool.endTime.getTime() - tool.startTime.getTime();
    const timing = new Text(`Duration: ${duration}ms`);
    timing.color = 'gray';
    box.append(timing);
  }

  return box;
}

/**
 * 创建状态栏组件
 */
export function createStatusBar(status: string): Text {
  const text = new Text(status);
  text.color = 'gray';
  return text;
}

/**
 * 创建分隔线
 */
export function createDivider(): Text {
  const text = new Text('─'.repeat(80));
  text.color = 'gray';
  return text;
}
