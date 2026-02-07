import pc from 'picocolors';

/**
 * 彩色输出系统
 * 支持 NO_COLOR 环境变量和 TTY 检测
 */
export class ColorSystem {
  private enabled: boolean;

  constructor() {
    // 检测是否应该启用颜色
    this.enabled = this.shouldEnableColors();
  }

  /**
   * 检测是否应该启用颜色
   */
  private shouldEnableColors(): boolean {
    // 检查 NO_COLOR 环境变量
    if (process.env.NO_COLOR) {
      return false;
    }

    // 检查是否是 TTY
    if (!process.stdout.isTTY) {
      return false;
    }

    return true;
  }

  /**
   * 用户输入 - 青色
   */
  user(text: string): string {
    return this.enabled ? pc.cyan(text) : text;
  }

  /**
   * AI 响应 - 默认色
   */
  ai(text: string): string {
    return text;
  }

  /**
   * 工具调用 - 黄色
   */
  tool(text: string): string {
    return this.enabled ? pc.yellow(text) : text;
  }

  /**
   * 成功信息 - 绿色
   */
  success(text: string): string {
    return this.enabled ? pc.green(text) : text;
  }

  /**
   * 错误信息 - 红色
   */
  error(text: string): string {
    return this.enabled ? pc.red(text) : text;
  }

  /**
   * 警告信息 - 黄色
   */
  warning(text: string): string {
    return this.enabled ? pc.yellow(text) : text;
  }

  /**
   * 系统提示 - 灰色
   */
  system(text: string): string {
    return this.enabled ? pc.dim(text) : text;
  }

  /**
   * 高亮文本 - 粗体
   */
  bold(text: string): string {
    return this.enabled ? pc.bold(text) : text;
  }

  /**
   * 代码 - 青色背景
   */
  code(text: string): string {
    return this.enabled ? pc.bgCyan(pc.black(text)) : `\`${text}\``;
  }

  /**
   * 链接 - 蓝色下划线
   */
  link(text: string): string {
    return this.enabled ? pc.blue(pc.underline(text)) : text;
  }

  /**
   * 是否启用颜色
   */
  isEnabled(): boolean {
    return this.enabled;
  }
}

// 导出单例
export const colors = new ColorSystem();
