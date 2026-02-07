/**
 * TUI v3 - 核心组件接口
 * 参考 pi-tui 的极简设计理念
 */

/**
 * 基础组件接口
 * 所有组件只需实现 render 方法
 */
export interface Component {
  /**
   * 渲染组件为字符串数组
   * @param width 视口宽度
   * @returns 每行一个字符串，不能超过 width
   */
  render(width: number): string[];

  /**
   * 处理键盘输入（可选）
   */
  handleInput?(data: string): void;

  /**
   * 清除缓存状态（可选）
   */
  invalidate?(): void;
}

/**
 * 可聚焦组件接口
 */
export interface Focusable {
  focused: boolean;
}

/**
 * 光标位置标记（零宽度 APC 序列）
 * 用于 IME 支持
 */
export const CURSOR_MARKER = "\x1b_sanbot:cursor\x07";

/**
 * 类型守卫：检查组件是否实现了 Focusable 接口
 */
export function isFocusable(component: Component | null): component is Component & Focusable {
  return component !== null && 'focused' in component;
}

/**
 * 容器组件基类
 * 管理子组件列表
 */
export class Container implements Component {
  protected children: Component[] = [];

  addChild(child: Component): void {
    this.children.push(child);
  }

  removeChild(child: Component): void {
    const index = this.children.indexOf(child);
    if (index !== -1) {
      this.children.splice(index, 1);
    }
  }

  clearChildren(): void {
    this.children = [];
  }

  getChildren(): Component[] {
    return [...this.children];
  }

  render(width: number): string[] {
    const lines: string[] = [];
    for (const child of this.children) {
      lines.push(...child.render(width));
    }
    return lines;
  }

  invalidate(): void {
    for (const child of this.children) {
      child.invalidate?.();
    }
  }
}
