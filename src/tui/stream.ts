import { markdown } from './markdown.js';
import { colors } from './colors.js';

export interface StreamWriterInterface {
  write(chunk: string): void;
  writeLine(line: string): void;
  writeMarkdown(text: string): void;
  getBuffer(): string;
  clear(): void;
  end(): void;
  renderBuffer(): void;
}

/**
 * 流式文本输出管理器
 * 支持 Markdown 渲染和实时输出
 */
export class StreamWriter implements StreamWriterInterface {
  private buffer: string = '';
  private isTTY: boolean;
  private useMarkdown: boolean;

  constructor(useMarkdown: boolean = true) {
    this.isTTY = process.stdout.isTTY ?? false;
    this.useMarkdown = useMarkdown && markdown.isEnabled();
  }

  /**
   * 写入流式文本块
   */
  write(chunk: string): void {
    if (!chunk) return;

    this.buffer += chunk;
    
    // 流式输出时不渲染 Markdown（等待完整内容）
    process.stdout.write(chunk);
  }

  /**
   * 写入完整行
   */
  writeLine(line: string): void {
    this.buffer += line + '\n';
    console.log(line);
  }

  /**
   * 写入渲染后的 Markdown
   */
  writeMarkdown(text: string): void {
    if (this.useMarkdown) {
      const rendered = markdown.render(text);
      process.stdout.write(rendered);
    } else {
      process.stdout.write(text);
    }
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
   * 结束流式输出（添加换行）
   */
  end(): void {
    if (this.buffer && !this.buffer.endsWith('\n')) {
      process.stdout.write('\n');
    }
  }

  /**
   * 渲染缓冲区中的 Markdown（用于流式完成后）
   */
  renderBuffer(): void {
    if (this.useMarkdown && this.buffer) {
      // 清除已输出的原始文本
      const lines = this.buffer.split('\n').length;
      for (let i = 0; i < lines; i++) {
        process.stdout.write('\x1b[1A\x1b[2K'); // 上移一行并清除
      }
      
      // 输出渲染后的内容
      this.writeMarkdown(this.buffer);
    }
  }
}

/**
 * 格式化工具调用信息
 */
export function formatToolCall(toolName: string, input: any): string {
  const inputStr = JSON.stringify(input, null, 2);
  return colors.system(`\n🔧 ${toolName}\n${inputStr}\n`);
}

/**
 * 格式化工具结果
 */
export function formatToolResult(success: boolean, result?: any): string {
  const icon = success ? '✅' : '❌';
  const status = success ? colors.success('Success') : colors.error('Failed');
  
  if (result && typeof result === 'object') {
    const resultStr = JSON.stringify(result, null, 2);
    return colors.system(`${icon} ${status}\n${resultStr}\n`);
  }
  
  return colors.system(`${icon} ${status}\n`);
}
