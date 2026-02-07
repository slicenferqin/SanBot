// @ts-nocheck

/**
 * TUI v3 - 工具函数
 */

// Intl.Segmenter type declaration (supported in modern runtimes)
declare global {
  namespace Intl {
    interface SegmenterOptions {
      granularity?: 'grapheme' | 'word' | 'sentence';
    }
    interface SegmentData {
      segment: string;
      index: number;
      input: string;
    }
    interface Segments {
      [Symbol.iterator](): IterableIterator<SegmentData>;
    }
    class Segmenter {
      constructor(locale?: string, options?: SegmenterOptions);
      segment(input: string): Segments;
    }
  }
}

import { createColors } from "picocolors";

// 使用 picocolors 进行颜色处理
const baseColors = createColors(true);

// 创建支持链式调用的颜色函数
const createColorFn = (code: string) => {
  const fn = (s: string) => `\x1b[${code}m${s}\x1b[0m`;
  fn.bold = (s: string) => `\x1b[1m\x1b[${code}m${s}\x1b[0m`;
  fn.dim = (s: string) => `\x1b[2m\x1b[${code}m${s}\x1b[0m`;
  return fn;
};

export const pc = {
  ...baseColors,
  // 添加 bold 支持
  bold: (s: string) => `\x1b[1m${s}\x1b[22m`,
  // 添加 dim 支持
  dim: (s: string) => `\x1b[2m${s}\x1b[22m`,
  // 支持链式调用的颜色
  green: createColorFn('32'),
  cyan: createColorFn('36'),
  yellow: createColorFn('33'),
  red: createColorFn('31'),
  magenta: createColorFn('35'),
  gray: createColorFn('90'),
  // 背景色
  bgWhite: (s: string) => `\x1b[47m${s}\x1b[49m`,
  bgBlack: (s: string) => `\x1b[40m${s}\x1b[49m`,
  bgCyan: (s: string) => `\x1b[46m${s}\x1b[49m`,
  // 前景色（用于组合）
  black: (s: string) => `\x1b[30m${s}\x1b[39m`,
  white: (s: string) => `\x1b[37m${s}\x1b[39m`,
};

/**
 * 移除 ANSI 转义序列
 */
export function stripAnsi(str: string): string {
  // 匹配各种 ANSI 序列：CSI, OSC, APC 等
  return str.replace(/\x1b(?:\[[0-9;]*[a-zA-Z]|\][^\x07]*\x07|_[^\x07]*\x07)/g, "");
}

/**
 * 判断字符是否为宽字符（CJK、emoji等）
 * 宽字符在终端中占用2个字符宽度
 */
function isWideChar(char: string): boolean {
  const code = char.codePointAt(0);
  if (code === undefined) return false;

  // CJK 字符范围
  if (
    (code >= 0x4E00 && code <= 0x9FFF) ||   // CJK Unified Ideographs
    (code >= 0x3400 && code <= 0x4DBF) ||   // CJK Unified Ideographs Extension A
    (code >= 0x20000 && code <= 0x2A6DF) || // CJK Unified Ideographs Extension B
    (code >= 0x2A700 && code <= 0x2B73F) || // CJK Unified Ideographs Extension C
    (code >= 0x2B740 && code <= 0x2B81F) || // CJK Unified Ideographs Extension D
    (code >= 0xF900 && code <= 0xFAFF) ||   // CJK Compatibility Ideographs
    (code >= 0x3000 && code <= 0x303F) ||   // CJK Symbols and Punctuation
    (code >= 0xFF00 && code <= 0xFFEF) ||   // Halfwidth and Fullwidth Forms
    (code >= 0x1100 && code <= 0x11FF) ||   // Hangul Jamo
    (code >= 0xAC00 && code <= 0xD7AF) ||   // Hangul Syllables
    (code >= 0x3040 && code <= 0x309F) ||   // Hiragana
    (code >= 0x30A0 && code <= 0x30FF) ||   // Katakana
    (code >= 0x1F300 && code <= 0x1F9FF)    // Emoji 范围（部分）
  ) {
    return true;
  }

  return false;
}

/**
 * 计算字符串的可见宽度（排除 ANSI 转义序列）
 * 正确处理 CJK 宽字符
 */
export function visibleWidth(str: string): number {
  const clean = stripAnsi(str);
  let width = 0;

  // 使用 Intl.Segmenter 来正确分割字符（包括 emoji）
  const segmenter = new Intl.Segmenter('zh', { granularity: 'grapheme' });
  const segments = Array.from(segmenter.segment(clean));

  for (const { segment } of segments) {
    // 检查是否为宽字符
    if (isWideChar(segment)) {
      width += 2;
    } else {
      width += 1;
    }
  }

  return width;
}

/**
 * 将字符串截断到指定宽度（正确处理 ANSI 和宽字符）
 */
export function truncateToWidth(str: string, width: number, ellipsis: string = "..."): string {
  const currentWidth = visibleWidth(str);
  if (currentWidth <= width) {
    return str;
  }

  const ellipsisWidth = visibleWidth(ellipsis);
  const targetWidth = width - ellipsisWidth;

  if (targetWidth <= 0) {
    return ellipsis.slice(0, width);
  }

  // 使用 Intl.Segmenter 来正确分割字符
  const segmenter = new Intl.Segmenter('zh', { granularity: 'grapheme' });

  let result = "";
  let currentWidthCount = 0;
  let inAnsi = false;
  let ansiBuffer = "";

  for (let i = 0; i < str.length; i++) {
    const char = str[i];

    // 检测 ANSI 序列开始
    if (char === '\x1b') {
      inAnsi = true;
      ansiBuffer = char;
      continue;
    }

    // 在 ANSI 序列中
    if (inAnsi) {
      ansiBuffer += char;
      // 检测 ANSI 序列结束（字母结尾的 CSI 序列或 \x07 结尾的 OSC/APC 序列）
      if (/[a-zA-Z]$/.test(ansiBuffer) || char === '\x07') {
        result += ansiBuffer;
        inAnsi = false;
        ansiBuffer = "";
      }
      continue;
    }

    // 计算字符宽度
    const charWidth = isWideChar(char) ? 2 : 1;

    // 检查是否超出目标宽度
    if (currentWidthCount + charWidth > targetWidth) {
      break;
    }

    result += char;
    currentWidthCount += charWidth;
  }

  // 添加重置序列和省略号
  return result + "\x1b[0m" + ellipsis;
}

/**
 * 将文本按宽度自动换行
 */
export function wrapText(text: string, width: number): string[] {
  const lines: string[] = [];
  const words = text.split(/\s+/);
  
  let currentLine = "";
  
  for (const word of words) {
    const wordWidth = visibleWidth(word);
    const lineWidth = visibleWidth(currentLine);
    
    if (lineWidth + wordWidth + 1 <= width) {
      currentLine += (currentLine ? " " : "") + word;
    } else {
      if (currentLine) {
        lines.push(currentLine);
      }
      // 如果单词本身超过宽度，强制截断
      if (wordWidth > width) {
        let remaining = word;
        while (visibleWidth(remaining) > width) {
          let chunk = "";
          let chunkWidth = 0;
          for (const char of remaining) {
            if (chunkWidth + visibleWidth(char) > width) {
              break;
            }
            chunk += char;
            chunkWidth += visibleWidth(char);
          }
          lines.push(chunk);
          remaining = remaining.slice(chunk.length);
        }
        currentLine = remaining;
      } else {
        currentLine = word;
      }
    }
  }
  
  if (currentLine) {
    lines.push(currentLine);
  }
  
  return lines;
}

/**
 * 重复字符串
 */
export function repeat(str: string, count: number): string {
  return str.repeat(count);
}

/**
 * 填充字符串到指定宽度
 */
export function padEnd(str: string, width: number): string {
  const currentWidth = visibleWidth(str);
  if (currentWidth >= width) {
    return str;
  }
  return str + " ".repeat(width - currentWidth);
}
