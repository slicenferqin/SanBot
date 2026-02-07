import { marked } from 'marked';
import { markedTerminal } from 'marked-terminal';
import { highlight } from 'cli-highlight';
import { colors } from './colors.js';

/**
 * Markdown 渲染器
 * 支持代码高亮、列表、标题等
 */
export class MarkdownRenderer {
  private renderer: typeof marked;
  private enabled: boolean;

  constructor() {
    this.enabled = process.stdout.isTTY ?? false;
    this.renderer = marked;

    if (this.enabled) {
      // 配置 marked-terminal
      this.renderer.use(
        markedTerminal({
          // 代码块高亮
          code: (code: string, lang?: string) => {
            try {
              const highlighted = highlight(code, {
                language: lang || 'text',
                ignoreIllegals: true,
              });
              return this.wrapCodeBlock(highlighted, lang);
            } catch (e) {
              return this.wrapCodeBlock(code, lang);
            }
          },
          // 标题样式
          heading: (text: string, level: number) => {
            const prefix = '█'.repeat(level);
            return colors.bold(`\n${prefix} ${text}\n`);
          },
          // 列表样式
          list: (body: string, ordered: boolean) => {
            return body;
          },
          listitem: (text: string) => {
            return `  • ${text}\n`;
          },
          // 段落
          paragraph: (text: string) => {
            return `${text}\n`;
          },
          // 内联代码
          codespan: (code: string) => {
            return colors.code(` ${code} `);
          },
          // 链接
          link: (href: string, title: string, text: string) => {
            return colors.link(text) + colors.system(` (${href})`);
          },
          // 强调
          strong: (text: string) => {
            return colors.bold(text);
          },
          em: (text: string) => {
            return colors.system(text);
          },
          // 引用
          blockquote: (quote: string) => {
            const lines = quote.split('\n');
            return lines.map(line => colors.system(`│ ${line}`)).join('\n') + '\n';
          },
          // 水平线
          hr: () => {
            return colors.system('─'.repeat(50)) + '\n';
          },
        })
      );
    }
  }

  /**
   * 渲染 Markdown 文本
   */
  render(markdown: string): string {
    if (!this.enabled) {
      // 非 TTY 环境，返回原始文本
      return markdown;
    }

    try {
      return this.renderer.parse(markdown) as string;
    } catch (e) {
      // 渲染失败，返回原始文本
      return markdown;
    }
  }

  /**
   * 包装代码块
   */
  private wrapCodeBlock(code: string, lang?: string): string {
    const width = 60;
    const langLabel = lang ? ` ${lang} ` : '';
    const topBorder = `┌─${langLabel}${'─'.repeat(Math.max(0, width - langLabel.length - 2))}┐`;
    const bottomBorder = `└${'─'.repeat(width)}┘`;

    const lines = code.split('\n');
    const paddedLines = lines.map(line => {
      const stripped = this.stripAnsi(line);
      const padding = ' '.repeat(Math.max(0, width - stripped.length - 2));
      return `│ ${line}${padding} │`;
    });

    return [
      colors.system(topBorder),
      ...paddedLines,
      colors.system(bottomBorder),
      '',
    ].join('\n');
  }

  /**
   * 移除 ANSI 转义码（用于计算实际长度）
   */
  private stripAnsi(str: string): string {
    return str.replace(/\x1b\[[0-9;]*m/g, '');
  }

  /**
   * 渲染代码块（独立使用）
   */
  renderCode(code: string, lang?: string): string {
    if (!this.enabled) {
      return `\`\`\`${lang || ''}\n${code}\n\`\`\``;
    }

    try {
      const highlighted = highlight(code, {
        language: lang || 'text',
        ignoreIllegals: true,
      });
      return this.wrapCodeBlock(highlighted, lang);
    } catch (e) {
      return this.wrapCodeBlock(code, lang);
    }
  }

  /**
   * 是否启用渲染
   */
  isEnabled(): boolean {
    return this.enabled;
  }
}

// 导出单例
export const markdown = new MarkdownRenderer();
