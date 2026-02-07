/**
 * TUI v3 - 主入口
 * SanBot TUI 集成
 */

import { TUI } from "./core/tui";
import { Header, type HeaderProps } from "./components/sanbot";
import { ConversationArea } from "./components/sanbot";
import { ToolCallsPanel } from "./components/sanbot";
import { StatusBar } from "./components/sanbot";
import { Spacer, Divider } from "./components/base";
import { Editor } from "./components/editor";
import type { Message, ToolCall } from "./components/sanbot";
import { pc } from "./utils";

export interface SanBotTUIOptions {
  sessionId: string;
  model: string;
  memoryEnabled?: boolean;
  toolCount?: number;
}

export class SanBotTUI {
  private tui: TUI;
  private header: Header;
  private conversationArea: ConversationArea;
  private toolCallsPanel: ToolCallsPanel;
  private editor: Editor;
  private statusBar: StatusBar;

  constructor(options: SanBotTUIOptions) {
    this.tui = new TUI();

    // 创建组件，将 requestRender 传递给需要动态更新的组件
    this.header = new Header({
      sessionId: options.sessionId,
      model: options.model,
      memoryEnabled: options.memoryEnabled ?? true,
      toolCount: options.toolCount ?? 0,
    });

    this.conversationArea = new ConversationArea();
    this.toolCallsPanel = new ToolCallsPanel(() => this.tui.requestRender());

    this.editor = new Editor({
      borderColor: pc.green,
      placeholder: "Type your message... (Ctrl+Enter to submit)",
      multiline: true,
      maxVisibleLines: 5,
    });

    this.statusBar = new StatusBar("Ready. Type your message and press Ctrl+Enter to submit.");

    // 组装 UI
    this.tui.addChild(this.header);
    this.tui.addChild(new Spacer(1));
    this.tui.addChild(this.conversationArea);
    this.tui.addChild(new Spacer(1));
    this.tui.addChild(this.toolCallsPanel);
    this.tui.addChild(new Divider());
    this.tui.addChild(this.editor);
    this.tui.addChild(this.statusBar);

    // 设置焦点到编辑器
    this.tui.setFocus(this.editor);

    // 绑定编辑器事件
    this.editor.onChange = () => this.tui.requestRender();
  }

  /**
   * 获取 TUI 实例（用于高级用法）
   */
  getTUI(): TUI {
    return this.tui;
  }

  /**
   * 启动 TUI
   */
  start(): void {
    this.tui.start();
  }

  /**
   * 停止 TUI
   */
  stop(): void {
    this.tui.stop();
  }

  /**
   * 设置提交回调
   */
  onSubmit(callback: (text: string) => void): void {
    this.editor.onSubmit = callback;
  }

  /**
   * 添加用户消息
   */
  addUserMessage(text: string): void {
    this.conversationArea.addMessage({
      role: "user",
      content: text,
      timestamp: new Date().toISOString(),
    });
    this.tui.requestRender();
  }

  /**
   * 开始助手消息（流式）
   */
  startAssistantMessage(): void {
    this.conversationArea.startStreaming();
    this.tui.requestRender();
  }

  /**
   * 追加助手消息内容
   */
  appendAssistantMessage(text: string | undefined): void {
    if (text === undefined) return;
    this.conversationArea.appendStream(text);
    this.tui.requestRender();
  }

  /**
   * 结束助手消息
   */
  endAssistantMessage(): string {
    const content = this.conversationArea.endStreaming();
    this.conversationArea.addMessage({
      role: "assistant",
      content,
      timestamp: new Date().toISOString(),
    });
    this.tui.requestRender();
    return content;
  }

  /**
   * 添加工具调用
   */
  addToolCall(call: ToolCall): void {
    this.toolCallsPanel.addToolCall(call);
    this.tui.requestRender();
  }

  /**
   * 更新工具调用状态
   */
  updateToolCall(id: string, updates: Partial<ToolCall>): void {
    this.toolCallsPanel.updateToolCall(id, updates);
    this.tui.requestRender();
  }

  /**
   * 清除工具调用
   */
  clearToolCalls(): void {
    this.toolCallsPanel.clearToolCalls();
    this.tui.requestRender();
  }

  /**
   * 设置状态栏文本
   */
  setStatus(text: string): void {
    this.statusBar.setText(text);
    this.tui.requestRender();
  }

  /**
   * 更新 Header
   */
  updateHeader(props: Partial<HeaderProps>): void {
    this.header.updateProps(props);
    this.tui.requestRender();
  }
}

// 导出所有类型和组件
export * from "./core/component";
export * from "./core/tui";
export * from "./core/terminal";
export * from "./components/base";
export * from "./components/sanbot";
export * from "./components/editor";
export * from "./utils";
