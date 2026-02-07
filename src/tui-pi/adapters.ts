/**
 * TUI-PI 适配器
 * 将 SanBot Agent 的 StreamWriter 和 ToolSpinner 接口适配到 TUI-PI
 */

import type { SanBotPiTUI } from './tui.ts';
import type { ToolCall } from './types.ts';
import type { StreamWriterInterface, ToolSpinnerInterface } from '../tui/index.ts';

/**
 * StreamWriter 适配器
 * 将流式输出转发到 TUI
 */
export class TUIStreamWriter implements StreamWriterInterface {
  private tui: SanBotPiTUI;
  private buffer: string = '';

  constructor(tui: SanBotPiTUI) {
    this.tui = tui;
  }

  /**
   * 写入文本
   */
  write(text: string): void {
    this.buffer += text;
    this.tui.appendAssistantMessage(text);
  }

  writeLine(line: string): void {
    this.write(line + '\n');
  }

  writeMarkdown(text: string): void {
    this.write(text);
  }

  /**
   * 结束写入
   */
  end(): void {
    // 由 TUI 的 endAssistantMessage 处理
  }

  /**
   * 获取缓冲区内容
   */
  getBuffer(): string {
    return this.buffer;
  }

  clear(): void {
    this.buffer = '';
  }

  renderBuffer(): void {
    // 由 TUI 渲染
  }
}

/**
 * ToolSpinner 适配器
 * 将工具调用状态转发到 TUI
 */
export class TUIToolSpinner implements ToolSpinnerInterface {
  private tui: SanBotPiTUI;
  private currentToolId: string | null = null;
  private toolCounter: number = 0;

  constructor(tui: SanBotPiTUI) {
    this.tui = tui;
  }

  /**
   * 开始工具调用
   */
  start(toolName: string, input: any): void {
    this.toolCounter++;
    this.currentToolId = `tool-${this.toolCounter}-${Date.now()}`;

    const tool: ToolCall = {
      id: this.currentToolId,
      name: toolName,
      input,
      status: 'pending',
      startTime: new Date(),
    };

    this.tui.addToolCall(tool);
    this.tui.setStatus(`running ${toolName}`);
  }

  /**
   * 工具调用成功
   */
  success(toolName: string, _meta?: { message?: string; durationMs?: number }): void {
    if (this.currentToolId) {
      this.tui.updateToolCall(this.currentToolId, {
        status: 'success',
        endTime: new Date(),
      });
    }
    this.tui.setStatus('streaming');
    this.currentToolId = null;
  }

  /**
   * 工具调用失败
   */
  error(toolName: string, errorMsg?: string, _meta?: { message?: string; durationMs?: number }): void {
    if (this.currentToolId) {
      this.tui.updateToolCall(this.currentToolId, {
        status: 'error',
        error: errorMsg,
        endTime: new Date(),
      });
    }
    this.tui.setStatus('streaming');
    this.currentToolId = null;
  }

  /**
   * 停止当前工具调用显示
   */
  stop(): void {
    // 用于 exec 工具需要用户确认时暂停 spinner
    this.currentToolId = null;
  }
}
