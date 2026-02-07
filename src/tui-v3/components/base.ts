// @ts-nocheck

/**
 * TUI v3 - 基础组件
 */

import { type Component } from "../core/component";
import { pc, visibleWidth, padEnd, wrapText, truncateToWidth } from "../utils";

/**
 * 文本组件 - 支持自动换行
 */
export class Text implements Component {
  private cachedText?: string;
  private cachedWidth?: number;
  private cachedLines?: string[];

  constructor(
    private text: string = "",
    private paddingX: number = 0,
    private paddingY: number = 0
  ) {}

  setText(text: string): void {
    this.text = text;
    this.invalidate();
  }

  getText(): string {
    return this.text;
  }

  invalidate(): void {
    this.cachedText = undefined;
    this.cachedWidth = undefined;
    this.cachedLines = undefined;
  }

  render(width: number): string[] {
    // 检查缓存
    if (this.cachedLines && this.cachedText === this.text && this.cachedWidth === width) {
      return this.cachedLines;
    }

    if (this.text === "" || this.text.trim() === "") {
      const result: string[] = [];
      this.cachedText = this.text;
      this.cachedWidth = width;
      this.cachedLines = result;
      return result;
    }

    // 计算内容区域宽度
    const contentWidth = Math.max(1, width - this.paddingX * 2);

    // 按换行符分割，然后对每行进行换行处理
    const inputLines = this.text.split("\n");
    const wrappedLines: string[] = [];

    for (const line of inputLines) {
      if (line === "") {
        wrappedLines.push("");
      } else {
        wrappedLines.push(...wrapText(line, contentWidth));
      }
    }

    // 添加左右内边距
    const leftPadding = " ".repeat(this.paddingX);
    const contentLines = wrappedLines.map(line => {
      const paddedLine = leftPadding + line;
      const lineWidth = visibleWidth(paddedLine);
      const rightPadding = " ".repeat(Math.max(0, width - lineWidth));
      return paddedLine + rightPadding;
    });

    // 添加上下内边距
    const emptyLine = " ".repeat(width);
    const topPadding = Array(this.paddingY).fill(emptyLine);
    const bottomPadding = Array(this.paddingY).fill(emptyLine);

    const result = [...topPadding, ...contentLines, ...bottomPadding];

    // 更新缓存
    this.cachedText = this.text;
    this.cachedWidth = width;
    this.cachedLines = result;

    return result.length > 0 ? result : [""];
  }
}

/**
 * 空白占位组件
 */
export class Spacer implements Component {
  constructor(private height: number = 1) {}

  render(_width: number): string[] {
    return Array(this.height).fill("");
  }
}

/**
 * 边框盒子组件
 */
export interface BoxStyle {
  borderColor?: (s: string) => string;
  padding?: number;
}

export class Box implements Component {
  private content: Component;
  private style: BoxStyle;

  constructor(content: Component, style: BoxStyle = {}) {
    this.content = content;
    this.style = {
      padding: 1,
      ...style,
    };
  }

  render(width: number): string[] {
    const { borderColor = (s) => s, padding = 0 } = this.style;
    
    // 计算内容区域宽度
    const contentWidth = width - 2 - padding * 2;
    
    // 渲染内容
    const contentLines = this.content.render(contentWidth);
    
    // 构建边框
    const horizontal = borderColor("─".repeat(width - 2));
    const topBorder = borderColor("┌") + horizontal + borderColor("┐");
    const bottomBorder = borderColor("└") + horizontal + borderColor("┘");
    
    const lines: string[] = [topBorder];
    
    // 上内边距
    for (let i = 0; i < padding; i++) {
      lines.push(borderColor("│") + " ".repeat(width - 2) + borderColor("│"));
    }
    
    // 内容行
    for (const line of contentLines) {
      const padded = padEnd(line, contentWidth);
      lines.push(
        borderColor("│") + 
        " ".repeat(padding) + 
        padded + 
        " ".repeat(padding) + 
        borderColor("│")
      );
    }
    
    // 下内边距
    for (let i = 0; i < padding; i++) {
      lines.push(borderColor("│") + " ".repeat(width - 2) + borderColor("│"));
    }
    
    lines.push(bottomBorder);
    
    return lines;
  }
}

/**
 * 加载动画组件
 */
export class Loader implements Component {
  private frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  private currentFrame = 0;
  private intervalId?: ReturnType<typeof setInterval>;
  private isRunning = false;
  private text: string = "";
  private onUpdate?: () => void;

  constructor(
    text: string = "",
    private colorFn: (s: string) => string = pc.yellow,
    private dimFn: (s: string) => string = pc.gray
  ) {
    this.text = text;
  }

  setText(text: string): void {
    this.text = text;
  }

  start(onUpdate?: () => void): void {
    if (this.isRunning) return;
    
    this.isRunning = true;
    this.onUpdate = onUpdate;
    
    this.intervalId = setInterval(() => {
      this.currentFrame = (this.currentFrame + 1) % this.frames.length;
      this.onUpdate?.();
    }, 80);
  }

  stop(): void {
    if (!this.isRunning) return;
    
    this.isRunning = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
  }

  render(_width: number): string[] {
    const frame = this.frames[this.currentFrame];
    const spinner = this.colorFn(frame);
    const text = this.text;
    const dimmedText = this.dimFn(text);
    return [`${spinner} ${dimmedText}`];
  }
}

/**
 * 水平分割线
 */
export class Divider implements Component {
  constructor(private char: string = "─") {}

  render(width: number): string[] {
    return [pc.cyan(this.char.repeat(width))];
  }
}
