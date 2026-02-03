import pc from 'picocolors';

/**
 * 流式文本输出管理器
 */
export class StreamWriter {
  private buffer: string = '';
  private isTTY: boolean;

  constructor() {
    this.isTTY = process.stdout.isTTY ?? false;
  }

  /**
   * 写入流式文本块
   */
  write(chunk: string): void {
    if (!chunk) return;

    this.buffer += chunk;
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
}

/**
 * 格式化工具调用信息
 */
export function formatToolCall(toolName: string, input: any): string {
  const inputStr = JSON.stringify(input, null, 2);
  return pc.dim(`\n🔧 ${toolName}\n${inputStr}\n`);
}

/**
 * 格式化工具结果
 */
export function formatToolResult(success: boolean, result?: any): string {
  const icon = success ? '✅' : '❌';
  const status = success ? pc.green('Success') : pc.red('Failed');
  
  if (result && typeof result === 'object') {
    const resultStr = JSON.stringify(result, null, 2);
    return pc.dim(`${icon} ${status}\n${resultStr}\n`);
  }
  
  return pc.dim(`${icon} ${status}\n`);
}
