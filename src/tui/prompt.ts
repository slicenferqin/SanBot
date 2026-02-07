import { colors } from './colors.js';

/**
 * 提示符和界面组件
 */
export class Prompt {
  /**
   * 显示欢迎界面
   */
  static welcome(): void {
    const width = 60;
    const title = 'SanBot';
    const subtitle = 'Autonomous Super-Assistant';
    const version = 'v0.2.0';

    console.log('');
    console.log(colors.system('┌' + '─'.repeat(width - 2) + '┐'));
    console.log(colors.system('│') + this.center(colors.bold(title), width - 2) + colors.system('│'));
    console.log(colors.system('│') + this.center(colors.system(subtitle), width - 2) + colors.system('│'));
    console.log(colors.system('│') + this.center(colors.system(version), width - 2) + colors.system('│'));
    console.log(colors.system('└' + '─'.repeat(width - 2) + '┘'));
    console.log('');
    console.log(colors.system('  Type your message or command, or type "exit" to quit.'));
    console.log('');
  }

  /**
   * 显示用户提示符
   */
  static user(): string {
    return colors.user('❯ ');
  }

  /**
   * 显示 AI 提示符
   */
  static ai(): string {
    return colors.system('🤖 ');
  }

  /**
   * 显示系统消息
   */
  static system(message: string): void {
    console.log(colors.system(`ℹ ${message}`));
  }

  /**
   * 显示成功消息
   */
  static success(message: string): void {
    console.log(colors.success(`✓ ${message}`));
  }

  /**
   * 显示警告消息
   */
  static warning(message: string): void {
    console.log(colors.warning(`⚠ ${message}`));
  }

  /**
   * 显示错误消息
   */
  static error(message: string): void {
    console.log(colors.error(`✗ ${message}`));
  }

  /**
   * 显示分隔线
   */
  static separator(): void {
    console.log(colors.system('─'.repeat(60)));
  }

  /**
   * 显示会话统计
   */
  static stats(stats: {
    duration: number;
    toolCalls: number;
    tokensIn?: number;
    tokensOut?: number;
  }): void {
    console.log('');
    console.log(colors.bold('📊 Session Stats:'));
    console.log(colors.system(`   Duration: ${this.formatDuration(stats.duration)}`));
    console.log(colors.system(`   Tool calls: ${stats.toolCalls}`));
    if (stats.tokensIn !== undefined && stats.tokensOut !== undefined) {
      console.log(colors.system(`   Tokens: ~${stats.tokensIn} in / ~${stats.tokensOut} out`));
    }
    console.log('');
  }

  /**
   * 居中文本
   */
  private static center(text: string, width: number): string {
    const stripped = this.stripAnsi(text);
    const padding = Math.max(0, width - stripped.length);
    const leftPad = Math.floor(padding / 2);
    const rightPad = padding - leftPad;
    return ' '.repeat(leftPad) + text + ' '.repeat(rightPad);
  }

  /**
   * 移除 ANSI 转义码
   */
  private static stripAnsi(str: string): string {
    return str.replace(/\x1b\[[0-9;]*m/g, '');
  }

  /**
   * 格式化时长
   */
  private static formatDuration(ms: number): string {
    if (ms < 1000) {
      return `${ms}ms`;
    }
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) {
      return `${seconds}s`;
    }
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  }
}
