/**
 * TUI v3 - Terminal 接口
 * 抽象终端操作，支持真实终端和测试环境
 */

import { ReadStream, WriteStream } from "tty";

/**
 * 终端接口
 */
export interface Terminal {
  /** 终端列数 */
  readonly columns: number;
  /** 终端行数 */
  readonly rows: number;

  /**
   * 启动终端
   * @param onInput 输入回调
   * @param onResize 调整大小回调
   */
  start(
    onInput: (data: string) => void,
    onResize: () => void
  ): void;

  /**
   * 停止终端
   */
  stop(): void;

  /**
   * 写入数据到终端
   */
  write(data: string): void;

  /**
   * 清屏
   */
  clearScreen(): void;

  /**
   * 从光标位置清除到屏幕末尾
   */
  clearFromCursor(): void;

  /**
   * 移动光标相对位置
   * @param lines 正数向下，负数向上
   */
  moveBy(lines: number): void;

  /**
   * 隐藏光标
   */
  hideCursor(): void;

  /**
   * 显示光标
   */
  showCursor(): void;
}

/**
 * 进程终端实现
 * 使用 process.stdin/stdout
 */
export class ProcessTerminal implements Terminal {
  private stdin: ReadStream;
  private stdout: WriteStream;
  private onInput?: (data: string) => void;
  private onResize?: () => void;
  private rawMode = false;

  constructor() {
    this.stdin = process.stdin as ReadStream;
    this.stdout = process.stdout as WriteStream;
  }

  get columns(): number {
    return this.stdout.columns || 80;
  }

  get rows(): number {
    return this.stdout.rows || 24;
  }

  start(
    onInput: (data: string) => void,
    onResize: () => void
  ): void {
    this.onInput = onInput;
    this.onResize = onResize;

    // 设置 raw mode
    if (this.stdin.isTTY) {
      this.stdin.setRawMode(true);
      this.rawMode = true;
    }

    // 监听输入（Ctrl+C 由 TUI 类处理）
    this.stdin.on("data", (data: Buffer) => {
      const str = data.toString("utf-8");
      this.onInput?.(str);
    });

    // 监听 resize
    this.stdout.on("resize", () => {
      this.onResize?.();
    });

    // 隐藏光标
    this.hideCursor();
    
    // 清屏
    this.clearScreen();
  }

  stop(): void {
    // 恢复 raw mode
    if (this.rawMode && this.stdin.isTTY) {
      this.stdin.setRawMode(false);
      this.rawMode = false;
    }

    // 移除事件监听器
    this.stdin.removeAllListeners("data");
    this.stdout.removeAllListeners("resize");

    // 显示光标
    this.showCursor();
  }

  write(data: string): void {
    this.stdout.write(data);
  }

  clearScreen(): void {
    // 清屏并移动光标到左上角
    this.write("\x1b[2J\x1b[H");
  }

  clearFromCursor(): void {
    // 从光标位置清除到屏幕末尾
    this.write("\x1b[J");
  }

  moveBy(lines: number): void {
    if (lines > 0) {
      this.write(`\x1b[${lines}B`);
    } else if (lines < 0) {
      this.write(`\x1b[${-lines}A`);
    }
  }

  hideCursor(): void {
    this.write("\x1b[?25l");
  }

  showCursor(): void {
    this.write("\x1b[?25h");
  }
}
