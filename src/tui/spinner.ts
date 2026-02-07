import { createSpinner } from 'nanospinner';
import pc from 'picocolors';

export interface ToolSpinnerInterface {
  start(toolName: string, input: any): void;
  success(toolName: string): void;
  error(toolName: string, errorMsg?: string): void;
  stop(): void;
}

/**
 * 工具调用 Spinner 管理器
 */
export class ToolSpinner implements ToolSpinnerInterface {
  private spinner: ReturnType<typeof createSpinner> | null = null;
  private startTime: number = 0;
  private isTTY: boolean;

  constructor() {
    // 检测是否是 TTY 环境
    this.isTTY = process.stdout.isTTY ?? false;
  }

  /**
   * 开始显示工具调用状态
   */
  start(toolName: string, input: any): void {
    this.startTime = Date.now();

    // 确保在新行开始 spinner（避免覆盖流式输出的文本）
    process.stdout.write('\n');

    if (!this.isTTY) {
      // 非 TTY 环境，使用简单输出
      console.log(`🔧 Calling ${toolName}...`);
      return;
    }

    // 格式化输入参数摘要
    const inputSummary = this.formatInputSummary(input);
    const message = `${pc.yellow('Calling')} ${pc.bold(toolName)}${inputSummary}`;

    this.spinner = createSpinner(message).start();
  }

  /**
   * 工具调用成功
   */
  success(toolName: string): void {
    const duration = this.getDuration();
    
    if (!this.isTTY) {
      console.log(`✅ ${toolName} completed (${duration})`);
      return;
    }

    if (this.spinner) {
      this.spinner.success({ 
        text: `${pc.green(toolName)} ${pc.dim(`completed (${duration})`)}` 
      });
      this.spinner = null;
    }
  }

  /**
   * 工具调用失败
   */
  error(toolName: string, errorMsg?: string): void {
    const duration = this.getDuration();
    
    if (!this.isTTY) {
      console.log(`❌ ${toolName} failed (${duration})${errorMsg ? `: ${errorMsg}` : ''}`);
      return;
    }

    if (this.spinner) {
      const text = errorMsg 
        ? `${pc.red(toolName)} ${pc.dim(`failed (${duration})`)}: ${errorMsg}`
        : `${pc.red(toolName)} ${pc.dim(`failed (${duration})`)}`;
      
      this.spinner.error({ text });
      this.spinner = null;
    }
  }

  /**
   * 停止 spinner（不显示结果）
   */
  stop(): void {
    if (this.spinner) {
      this.spinner.stop();
      this.spinner = null;
    }
  }

  /**
   * 格式化输入参数摘要
   */
  private formatInputSummary(input: any): string {
    if (!input || typeof input !== 'object') {
      return '';
    }

    // 提取关键参数
    const keys = Object.keys(input);
    if (keys.length === 0) {
      return '';
    }

    // 只显示第一个参数的值（简化显示）
    const firstKey = keys[0];
    if (!firstKey) {
      return '';
    }

    const firstValue = input[firstKey];
    
    if (typeof firstValue === 'string') {
      // 截断长字符串
      const truncated = firstValue.length > 50 
        ? firstValue.substring(0, 47) + '...' 
        : firstValue;
      return pc.dim(`: ${truncated}`);
    }

    return '';
  }

  /**
   * 获取执行时长
   */
  private getDuration(): string {
    const duration = Date.now() - this.startTime;
    if (duration < 1000) {
      return `${duration}ms`;
    }
    return `${(duration / 1000).toFixed(1)}s`;
  }
}
