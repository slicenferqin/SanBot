// @ts-nocheck

/**
 * TUI v3 - TUI 主类
 * 差分渲染引擎，参考 pi-tui 实现
 */

import { ProcessTerminal, type Terminal } from "./terminal";
import { Container, type Component, isFocusable, CURSOR_MARKER } from "./component";
import { visibleWidth } from "../utils";

export class TUI extends Container {
  public terminal: Terminal;
  private previousLines: string[] = [];
  private previousWidth: number = 0;
  private focusedComponent: Component | null = null;
  private renderRequested = false;
  private cursorRow = 0;           // 逻辑光标行（内容末尾）
  private hardwareCursorRow = 0;   // 实际终端光标行（可能因 IME 定位而不同）
  private maxLinesRendered = 0;    // 追踪工作区域（渲染过的最大行数）
  private stopped = false;
  private lastEscTime = 0;         // 上次 ESC 按键时间（用于双击 ESC 退出）

  constructor(terminal: Terminal = new ProcessTerminal()) {
    super();
    this.terminal = terminal;
  }

  /**
   * 启动 TUI
   */
  start(): void {
    this.stopped = false;
    this.terminal.start(
      (data) => this.handleInput(data),
      () => this.requestRender()
    );
    this.terminal.hideCursor();
    this.requestRender();
  }

  /**
   * 停止 TUI
   */
  stop(): void {
    this.stopped = true;
    // 移动光标到内容末尾，避免覆盖
    if (this.previousLines.length > 0) {
      const targetRow = this.previousLines.length;
      const lineDiff = targetRow - this.hardwareCursorRow;
      if (lineDiff > 0) {
        this.terminal.write(`\x1b[${lineDiff}B`);
      } else if (lineDiff < 0) {
        this.terminal.write(`\x1b[${-lineDiff}A`);
      }
      this.terminal.write("\r\n");
    }
    this.terminal.showCursor();
    this.terminal.stop();
  }

  /**
   * 请求重新渲染
   * 使用 nextTick 避免重复渲染
   */
  requestRender(force = false): void {
    if (force) {
      this.previousLines = [];
      this.previousWidth = -1;
      this.cursorRow = 0;
      this.hardwareCursorRow = 0;
      this.maxLinesRendered = 0;
    }
    if (this.renderRequested) return;

    this.renderRequested = true;
    process.nextTick(() => {
      this.renderRequested = false;
      this.performRender();
    });
  }

  /**
   * 执行渲染
   */
  private performRender(): void {
    if (this.stopped) return;

    const width = this.terminal.columns;
    const height = this.terminal.rows;
    let lines = this.render(width);

    // 提取光标位置（用于 IME）
    const cursorPos = this.extractCursorPosition(lines, height);

    // 添加行重置序列
    lines = this.applyLineResets(lines);

    // 宽度变化需要全量重新渲染
    const widthChanged = this.previousWidth !== 0 && this.previousWidth !== width;

    // 首次渲染或宽度变化
    if (this.previousLines.length === 0 || widthChanged) {
      this.fullRender(lines, widthChanged);
      this.positionHardwareCursor(cursorPos, lines.length);
      this.previousLines = lines;
      this.previousWidth = width;
      return;
    }

    // 差分渲染
    this.differentialRender(lines, width, height);
    this.positionHardwareCursor(cursorPos, lines.length);

    this.previousLines = lines;
    this.previousWidth = width;
  }

  /**
   * 全量渲染
   */
  private fullRender(lines: string[], clear: boolean): void {
    let buffer = "\x1b[?2026h"; // 开启同步输出
    if (clear) buffer += "\x1b[3J\x1b[2J\x1b[H"; // 清除滚动缓冲、屏幕、移到左上角
    for (let i = 0; i < lines.length; i++) {
      if (i > 0) buffer += "\r\n";
      buffer += lines[i];
    }
    buffer += "\x1b[?2026l"; // 结束同步输出
    this.terminal.write(buffer);
    this.cursorRow = Math.max(0, lines.length - 1);
    this.hardwareCursorRow = this.cursorRow;
    this.maxLinesRendered = clear ? lines.length : Math.max(this.maxLinesRendered, lines.length);
  }

  /**
   * 差分渲染算法
   * 只更新变化的行，性能极佳
   */
  private differentialRender(lines: string[], width: number, height: number): void {
    const prev = this.previousLines;

    // 找到第一个和最后一个变化的行
    let firstChanged = -1;
    let lastChanged = -1;
    const maxLines = Math.max(lines.length, prev.length);

    for (let i = 0; i < maxLines; i++) {
      const oldLine = i < prev.length ? prev[i] : "";
      const newLine = i < lines.length ? lines[i] : "";
      if (oldLine !== newLine) {
        if (firstChanged === -1) firstChanged = i;
        lastChanged = i;
      }
    }

    // 没有变化
    if (firstChanged === -1) {
      return;
    }

    // 构建更新缓冲区
    let buffer = "\x1b[?2026h"; // 开启同步输出

    // 移动到第一个变化的行
    const lineDiff = firstChanged - this.hardwareCursorRow;
    if (lineDiff > 0) {
      buffer += `\x1b[${lineDiff}B`; // 向下移动
    } else if (lineDiff < 0) {
      buffer += `\x1b[${-lineDiff}A`; // 向上移动
    }
    buffer += "\r"; // 移到行首

    // 渲染变化的行
    const renderEnd = Math.min(lastChanged, lines.length - 1);
    for (let i = firstChanged; i <= renderEnd; i++) {
      if (i > firstChanged) buffer += "\r\n";
      buffer += "\x1b[2K"; // 清除当前行
      buffer += lines[i];
    }

    // 追踪光标位置
    let finalCursorRow = renderEnd;

    // 如果之前有更多行，清除它们
    if (prev.length > lines.length) {
      // 移到新内容末尾
      if (renderEnd < lines.length - 1) {
        const moveDown = lines.length - 1 - renderEnd;
        buffer += `\x1b[${moveDown}B`;
        finalCursorRow = lines.length - 1;
      }
      const extraLines = prev.length - lines.length;
      for (let i = lines.length; i < prev.length; i++) {
        buffer += "\r\n\x1b[2K";
      }
      // 移回新内容末尾
      buffer += `\x1b[${extraLines}A`;
    }

    buffer += "\x1b[?2026l"; // 结束同步输出

    this.terminal.write(buffer);
    this.cursorRow = Math.max(0, lines.length - 1);
    this.hardwareCursorRow = finalCursorRow;
    this.maxLinesRendered = Math.max(this.maxLinesRendered, lines.length);
  }

  /**
   * 添加行重置序列（确保每行样式不泄漏到下一行）
   */
  private applyLineResets(lines: string[]): string[] {
    const reset = "\x1b[0m";
    return lines.map(line => line + reset);
  }

  /**
   * 提取光标位置并从渲染输出中移除标记
   */
  private extractCursorPosition(lines: string[], height: number): { row: number; col: number } | null {
    const viewportTop = Math.max(0, lines.length - height);
    for (let row = lines.length - 1; row >= viewportTop; row--) {
      const line = lines[row];
      const markerIndex = line.indexOf(CURSOR_MARKER);
      if (markerIndex !== -1) {
        // 计算可见列位置
        const beforeMarker = line.slice(0, markerIndex);
        const col = visibleWidth(beforeMarker);

        // 从行中移除标记
        lines[row] = line.slice(0, markerIndex) + line.slice(markerIndex + CURSOR_MARKER.length);

        return { row, col };
      }
    }
    return null;
  }

  /**
   * 定位硬件光标（用于 IME 候选窗口）
   */
  private positionHardwareCursor(cursorPos: { row: number; col: number } | null, totalLines: number): void {
    if (!cursorPos || totalLines <= 0) {
      this.terminal.hideCursor();
      return;
    }

    const targetRow = Math.max(0, Math.min(cursorPos.row, totalLines - 1));
    const targetCol = Math.max(0, cursorPos.col);

    const rowDelta = targetRow - this.hardwareCursorRow;
    let buffer = "";
    if (rowDelta > 0) {
      buffer += `\x1b[${rowDelta}B`;
    } else if (rowDelta < 0) {
      buffer += `\x1b[${-rowDelta}A`;
    }
    // 移到绝对列位置（1-indexed）
    buffer += `\x1b[${targetCol + 1}G`;

    if (buffer) {
      this.terminal.write(buffer);
    }

    this.hardwareCursorRow = targetRow;
    // 默认隐藏光标，除非组件需要显示
    this.terminal.hideCursor();
  }

  /**
   * 渲染所有子组件
   */
  override render(width: number): string[] {
    const lines: string[] = [];

    for (const child of this.children) {
      const childLines = child.render(width);
      lines.push(...childLines);
    }

    return lines;
  }

  /**
   * 处理键盘输入
   */
  private handleInput(data: string): void {
    // Ctrl+C 处理
    if (data === "\x03") {
      this.stop();
      process.exit(0);
    }

    // ESC 双击退出（500ms 内连续按两次）
    if (data === "\x1b") {
      const now = Date.now();
      if (now - this.lastEscTime < 500) {
        // 连续两次 ESC，退出
        this.stop();
        process.exit(0);
      }
      this.lastEscTime = now;
      return; // 单次 ESC 不传递给组件
    }

    if (this.focusedComponent?.handleInput) {
      this.focusedComponent.handleInput(data);
      this.requestRender();
    }
  }

  /**
   * 设置焦点组件
   */
  setFocus(component: Component | null): void {
    // 清除旧组件的 focused 标志
    if (isFocusable(this.focusedComponent)) {
      this.focusedComponent.focused = false;
    }

    this.focusedComponent = component;

    // 设置新组件的 focused 标志
    if (isFocusable(component)) {
      component.focused = true;
    }
  }

  /**
   * 获取焦点组件
   */
  getFocus(): Component | null {
    return this.focusedComponent;
  }
}
