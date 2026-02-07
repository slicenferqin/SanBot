/**
 * TUI v3 适配器
 * 将旧的 StreamWriter 和 ToolSpinner 接口适配到 TUI v3
 */

import type { SanBotTUI } from './index';
import type { StreamWriterInterface } from '../tui/stream';
import type { ToolSpinnerInterface } from '../tui/spinner';

/**
 * StreamWriter 适配器 - 将流式文本输出到 TUI v3
 */
export class TUIStreamWriter implements StreamWriterInterface {
  private buffer: string = '';
  private tui: SanBotTUI;

  constructor(tui: SanBotTUI) {
    this.tui = tui;
  }

  /**
   * 写入流式文本块
   */
  write(chunk: string): void {
    if (!chunk) return;
    this.buffer += chunk;
    this.tui.appendAssistantMessage(chunk);
  }

  /**
   * 写入完整行
   */
  writeLine(line: string): void {
    this.buffer += line + '\n';
    this.tui.appendAssistantMessage(line + '\n');
  }

  /**
   * 写入渲染后的 Markdown（TUI v3 不需要特殊处理）
   */
  writeMarkdown(text: string): void {
    this.write(text);
  }

  /**
   * 获取累积的文本
   */
  getBuffer(): string {
    return this.buffer;
  }

  /**
   * 清空缓冲区
   */
  clear(): void {
    this.buffer = '';
  }

  /**
   * 结束流式输出
   */
  end(): void {
    // TUI v3 会自动处理
  }

  /**
   * 渲染缓冲区中的 Markdown
   */
  renderBuffer(): void {
    // TUI v3 不需要重新渲染
  }
}

/**
 * ToolSpinner 适配器 - 将工具调用状态显示到 TUI v3
 */
export class TUIToolSpinner implements ToolSpinnerInterface {
  private tui: SanBotTUI;
  private currentToolId: string | null = null;
  private startTime: number = 0;

  constructor(tui: SanBotTUI) {
    this.tui = tui;
  }

  /**
   * 开始显示工具调用状态
   */
  start(toolName: string, input: any): void {
    this.startTime = Date.now();
    this.currentToolId = `tool_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    this.tui.addToolCall({
      id: this.currentToolId,
      name: toolName,
      status: 'running',
      input,
    });
  }

  /**
   * 工具调用成功
   */
  success(toolName: string, _meta?: { message?: string; durationMs?: number }): void {
    if (this.currentToolId) {
      const duration = Date.now() - this.startTime;
      this.tui.updateToolCall(this.currentToolId, {
        status: 'success',
        duration,
      });
      this.currentToolId = null;
    }
  }

  /**
   * 工具调用失败
   */
  error(toolName: string, errorMsg?: string, _meta?: { message?: string; durationMs?: number }): void {
    if (this.currentToolId) {
      const duration = Date.now() - this.startTime;
      this.tui.updateToolCall(this.currentToolId, {
        status: 'error',
        duration,
        error: errorMsg,
      });
      this.currentToolId = null;
    }
  }

  /**
   * 停止 spinner（不显示结果）
   */
  stop(): void {
    if (this.currentToolId) {
      this.tui.updateToolCall(this.currentToolId, {
        status: 'cancelled',
      });
      this.currentToolId = null;
    }
  }
}
