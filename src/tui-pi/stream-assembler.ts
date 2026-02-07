/**
 * 流式文本组装器
 * 负责增量组装流式输出的文本
 */

import type { StreamState } from './types.ts';

export class StreamAssembler {
  private state: StreamState = {
    text: '',
    thinking: '',
    lastUpdate: new Date(),
  };

  /**
   * 摄入文本增量
   */
  ingestText(delta: string): string {
    this.state.text += delta;
    this.state.lastUpdate = new Date();
    return delta;
  }

  /**
   * 摄入思考增量
   */
  ingestThinking(delta: string): void {
    this.state.thinking += delta;
    this.state.lastUpdate = new Date();
  }

  /**
   * 获取当前完整文本
   */
  getText(): string {
    return this.state.text;
  }

  /**
   * 获取当前思考内容
   */
  getThinking(): string {
    return this.state.thinking;
  }

  /**
   * 获取显示文本（根据配置决定是否包含思考）
   */
  getDisplayText(showThinking: boolean): string {
    if (showThinking && this.state.thinking) {
      return `[Thinking]\n${this.state.thinking}\n\n${this.state.text}`;
    }
    return this.state.text;
  }

  /**
   * 重置状态
   */
  reset(): void {
    this.state = {
      text: '',
      thinking: '',
      lastUpdate: new Date(),
    };
  }

  /**
   * 获取状态快照
   */
  getState(): StreamState {
    return { ...this.state };
  }
}
