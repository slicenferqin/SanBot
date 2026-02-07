// @ts-nocheck

/**
 * TUI v3 - Editor 组件
 * 简化版的文本编辑器，支持多行输入
 */

import { type Component, type Focusable, CURSOR_MARKER } from "../core/component";
import { pc, visibleWidth, padEnd, wrapText } from "../utils";

/**
 * 编辑器状态
 */
interface EditorState {
  lines: string[];
  cursorLine: number;
  cursorCol: number;
}

/**
 * 编辑器选项
 */
export interface EditorOptions {
  borderColor?: (s: string) => string;
  placeholder?: string;
  multiline?: boolean;
  maxVisibleLines?: number;
}

/**
 * Editor 组件
 * 支持多行文本输入、光标移动、基本编辑操作
 */
export class Editor implements Component, Focusable {
  private state: EditorState = {
    lines: [""],
    cursorLine: 0,
    cursorCol: 0,
  };

  /** Focusable 接口 - TUI 设置焦点时更新 */
  focused: boolean = false;

  private options: Required<EditorOptions>;
  private lastWidth: number = 80;

  /** 提交回调 */
  public onSubmit?: (text: string) => void;
  /** 内容变化回调 */
  public onChange?: (text: string) => void;

  constructor(options?: EditorOptions) {
    this.options = {
      borderColor: options?.borderColor ?? pc.cyan,
      placeholder: options?.placeholder ?? "Type here...",
      multiline: options?.multiline ?? true,
      maxVisibleLines: options?.maxVisibleLines ?? 10,
    };
  }

  /**
   * 获取当前文本
   */
  getText(): string {
    return this.state.lines.join("\n");
  }

  /**
   * 设置文本
   */
  setText(text: string): void {
    const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
    this.state.lines = lines.length === 0 ? [""] : lines;
    this.state.cursorLine = this.state.lines.length - 1;
    this.state.cursorCol = this.state.lines[this.state.cursorLine]?.length || 0;
  }

  /**
   * 清空编辑器
   */
  clear(): void {
    this.state = {
      lines: [""],
      cursorLine: 0,
      cursorCol: 0,
    };
  }

  /**
   * 渲染编辑器
   */
  render(width: number): string[] {
    this.lastWidth = width;
    const { borderColor } = this.options;

    // 计算内容区域宽度（减去边框）
    const contentWidth = Math.max(1, width - 4);

    // 布局文本
    const layoutLines = this.layoutText(contentWidth);

    // 构建边框
    const horizontal = borderColor("─".repeat(width - 2));
    const topBorder = borderColor("┌") + horizontal + borderColor("┐");
    const bottomBorder = borderColor("└") + horizontal + borderColor("┘");

    const result: string[] = [topBorder];

    // 渲染每行
    for (const layoutLine of layoutLines) {
      let displayText = layoutLine.text;
      let lineWidth = visibleWidth(displayText);

      // 添加光标
      if (layoutLine.hasCursor && layoutLine.cursorPos !== undefined) {
        const before = displayText.slice(0, layoutLine.cursorPos);
        const after = displayText.slice(layoutLine.cursorPos);

        // 光标标记（用于 IME 定位）
        const marker = this.focused ? CURSOR_MARKER : "";

        if (after.length > 0) {
          // 光标在字符上 - 反色显示
          const firstChar = after[0];
          const restAfter = after.slice(1);
          const cursor = `\x1b[7m${firstChar}\x1b[0m`;
          displayText = before + marker + cursor + restAfter;
        } else {
          // 光标在末尾 - 显示反色空格
          const cursor = "\x1b[7m \x1b[0m";
          displayText = before + marker + cursor;
          lineWidth += 1;
        }
      }

      // 填充到内容宽度
      const padding = " ".repeat(Math.max(0, contentWidth - lineWidth));
      const line = borderColor("│") + " " + displayText + padding + " " + borderColor("│");
      result.push(line);
    }

    result.push(bottomBorder);

    // 添加提示文本
    if (this.state.lines.length === 1 && this.state.lines[0] === "") {
      result.push(pc.gray("  Press Enter to submit, Shift+Enter for new line"));
    }

    return result;
  }

  /**
   * 布局文本（处理换行）
   */
  private layoutText(contentWidth: number): Array<{
    text: string;
    hasCursor: boolean;
    cursorPos?: number;
  }> {
    const layoutLines: Array<{
      text: string;
      hasCursor: boolean;
      cursorPos?: number;
    }> = [];

    if (this.state.lines.length === 0 || (this.state.lines.length === 1 && this.state.lines[0] === "")) {
      // 空编辑器
      layoutLines.push({
        text: "",
        hasCursor: true,
        cursorPos: 0,
      });
      return layoutLines;
    }

    for (let i = 0; i < this.state.lines.length; i++) {
      const line = this.state.lines[i] || "";
      const isCurrentLine = i === this.state.cursorLine;

      if (visibleWidth(line) <= contentWidth) {
        // 行不需要换行
        if (isCurrentLine) {
          layoutLines.push({
            text: line,
            hasCursor: true,
            cursorPos: this.state.cursorCol,
          });
        } else {
          layoutLines.push({
            text: line,
            hasCursor: false,
          });
        }
      } else {
        // 行需要换行
        const wrapped = wrapText(line, contentWidth);
        let charOffset = 0;

        for (let j = 0; j < wrapped.length; j++) {
          const segment = wrapped[j];
          const segmentLen = segment.length;

          if (isCurrentLine) {
            const cursorInSegment =
              this.state.cursorCol >= charOffset &&
              (j === wrapped.length - 1 || this.state.cursorCol < charOffset + segmentLen);

            if (cursorInSegment) {
              layoutLines.push({
                text: segment,
                hasCursor: true,
                cursorPos: this.state.cursorCol - charOffset,
              });
            } else {
              layoutLines.push({
                text: segment,
                hasCursor: false,
              });
            }
          } else {
            layoutLines.push({
              text: segment,
              hasCursor: false,
            });
          }

          charOffset += segmentLen;
        }
      }
    }

    return layoutLines;
  }

  /**
   * 处理键盘输入
   */
  handleInput(data: string): void {
    // Enter - 提交
    if (data === "\r" || data === "\n") {
      this.submit();
      return;
    }

    // Shift+Enter 或 Alt+Enter - 新行
    if (data === "\x1b\r" || data === "\x1b\n") {
      this.insertNewLine();
      return;
    }

    // Backspace
    if (data === "\x7f" || data === "\b") {
      this.handleBackspace();
      return;
    }

    // Delete (Ctrl+D 或 Delete 键)
    if (data === "\x04" || data === "\x1b[3~") {
      this.handleDelete();
      return;
    }

    // 方向键
    if (data === "\x1b[A") { // Up
      this.moveCursorUp();
      return;
    }
    if (data === "\x1b[B") { // Down
      this.moveCursorDown();
      return;
    }
    if (data === "\x1b[C") { // Right
      this.moveCursorRight();
      return;
    }
    if (data === "\x1b[D") { // Left
      this.moveCursorLeft();
      return;
    }

    // Home (Ctrl+A 或 Home 键)
    if (data === "\x01" || data === "\x1b[H") {
      this.moveCursorToLineStart();
      return;
    }

    // End (Ctrl+E 或 End 键)
    if (data === "\x05" || data === "\x1b[F") {
      this.moveCursorToLineEnd();
      return;
    }

    // Ctrl+K - 删除到行尾
    if (data === "\x0b") {
      this.deleteToLineEnd();
      return;
    }

    // Ctrl+U - 删除到行首
    if (data === "\x15") {
      this.deleteToLineStart();
      return;
    }

    // 可打印字符
    if (data.length === 1 && data.charCodeAt(0) >= 32) {
      this.insertCharacter(data);
      return;
    }

    // 多字符输入（如中文、粘贴）
    if (data.length > 1 && !data.startsWith("\x1b")) {
      for (const char of data) {
        if (char.charCodeAt(0) >= 32) {
          this.insertCharacter(char);
        }
      }
    }
  }

  /**
   * 提交内容
   */
  private submit(): void {
    const text = this.getText().trim();
    if (text && this.onSubmit) {
      this.onSubmit(text);
      this.clear();
    }
  }

  /**
   * 插入新行
   */
  private insertNewLine(): void {
    const currentLine = this.state.lines[this.state.cursorLine] || "";
    const before = currentLine.slice(0, this.state.cursorCol);
    const after = currentLine.slice(this.state.cursorCol);

    this.state.lines[this.state.cursorLine] = before;
    this.state.lines.splice(this.state.cursorLine + 1, 0, after);
    this.state.cursorLine++;
    this.state.cursorCol = 0;

    this.triggerChange();
  }

  /**
   * 插入字符
   */
  private insertCharacter(char: string): void {
    const line = this.state.lines[this.state.cursorLine] || "";
    const before = line.slice(0, this.state.cursorCol);
    const after = line.slice(this.state.cursorCol);

    this.state.lines[this.state.cursorLine] = before + char + after;
    this.state.cursorCol += char.length;

    this.triggerChange();
  }

  /**
   * 处理退格键
   */
  private handleBackspace(): void {
    if (this.state.cursorCol > 0) {
      const line = this.state.lines[this.state.cursorLine] || "";
      const before = line.slice(0, this.state.cursorCol - 1);
      const after = line.slice(this.state.cursorCol);

      this.state.lines[this.state.cursorLine] = before + after;
      this.state.cursorCol--;
    } else if (this.state.cursorLine > 0) {
      // 合并到上一行
      const currentLine = this.state.lines[this.state.cursorLine] || "";
      const previousLine = this.state.lines[this.state.cursorLine - 1] || "";

      this.state.lines[this.state.cursorLine - 1] = previousLine + currentLine;
      this.state.lines.splice(this.state.cursorLine, 1);
      this.state.cursorLine--;
      this.state.cursorCol = previousLine.length;
    }

    this.triggerChange();
  }

  /**
   * 处理删除键
   */
  private handleDelete(): void {
    const line = this.state.lines[this.state.cursorLine] || "";

    if (this.state.cursorCol < line.length) {
      const before = line.slice(0, this.state.cursorCol);
      const after = line.slice(this.state.cursorCol + 1);

      this.state.lines[this.state.cursorLine] = before + after;
    } else if (this.state.cursorLine < this.state.lines.length - 1) {
      // 合并下一行
      const nextLine = this.state.lines[this.state.cursorLine + 1] || "";
      this.state.lines[this.state.cursorLine] = line + nextLine;
      this.state.lines.splice(this.state.cursorLine + 1, 1);
    }

    this.triggerChange();
  }

  /**
   * 光标上移
   */
  private moveCursorUp(): void {
    if (this.state.cursorLine > 0) {
      this.state.cursorLine--;
      const line = this.state.lines[this.state.cursorLine] || "";
      this.state.cursorCol = Math.min(this.state.cursorCol, line.length);
    }
  }

  /**
   * 光标下移
   */
  private moveCursorDown(): void {
    if (this.state.cursorLine < this.state.lines.length - 1) {
      this.state.cursorLine++;
      const line = this.state.lines[this.state.cursorLine] || "";
      this.state.cursorCol = Math.min(this.state.cursorCol, line.length);
    }
  }

  /**
   * 光标左移
   */
  private moveCursorLeft(): void {
    if (this.state.cursorCol > 0) {
      this.state.cursorCol--;
    } else if (this.state.cursorLine > 0) {
      this.state.cursorLine--;
      const line = this.state.lines[this.state.cursorLine] || "";
      this.state.cursorCol = line.length;
    }
  }

  /**
   * 光标右移
   */
  private moveCursorRight(): void {
    const line = this.state.lines[this.state.cursorLine] || "";
    if (this.state.cursorCol < line.length) {
      this.state.cursorCol++;
    } else if (this.state.cursorLine < this.state.lines.length - 1) {
      this.state.cursorLine++;
      this.state.cursorCol = 0;
    }
  }

  /**
   * 光标移到行首
   */
  private moveCursorToLineStart(): void {
    this.state.cursorCol = 0;
  }

  /**
   * 光标移到行尾
   */
  private moveCursorToLineEnd(): void {
    const line = this.state.lines[this.state.cursorLine] || "";
    this.state.cursorCol = line.length;
  }

  /**
   * 删除到行尾
   */
  private deleteToLineEnd(): void {
    const line = this.state.lines[this.state.cursorLine] || "";
    this.state.lines[this.state.cursorLine] = line.slice(0, this.state.cursorCol);
    this.triggerChange();
  }

  /**
   * 删除到行首
   */
  private deleteToLineStart(): void {
    const line = this.state.lines[this.state.cursorLine] || "";
    this.state.lines[this.state.cursorLine] = line.slice(this.state.cursorCol);
    this.state.cursorCol = 0;
    this.triggerChange();
  }

  /**
   * 触发内容变化回调
   */
  private triggerChange(): void {
    if (this.onChange) {
      this.onChange(this.getText());
    }
  }

  invalidate(): void {
    // 无需特殊处理
  }
}
