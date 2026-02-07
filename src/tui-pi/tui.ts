// @ts-nocheck

/**
 * SanBot TUI - 基于 pi-tui 的终端界面
 *
 * 简化版实现，直接适配 SanBot Agent API
 */

import {
  Box,
  Container,
  Editor,
  Loader,
  Markdown,
  ProcessTerminal,
  Text,
  TUI,
  Spacer,
  type MarkdownTheme,
} from '@mariozechner/pi-tui';
import type { ChatMessage, ToolCall, TUIConfig, TUIState } from './types.ts';
import { StreamAssembler } from './stream-assembler.ts';

// 主题颜色
const theme = {
  accent: (s: string) => `\x1b[36m${s}\x1b[0m`,      // cyan
  accentSoft: (s: string) => `\x1b[96m${s}\x1b[0m`,  // bright cyan
  dim: (s: string) => `\x1b[90m${s}\x1b[0m`,         // gray
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  user: (s: string) => `\x1b[32m${s}\x1b[0m`,        // green for user
  assistant: (s: string) => `\x1b[36m${s}\x1b[0m`,   // cyan for assistant
  italic: (s: string) => `\x1b[3m${s}\x1b[0m`,
  underline: (s: string) => `\x1b[4m${s}\x1b[0m`,
  strikethrough: (s: string) => `\x1b[9m${s}\x1b[0m`,
  // 背景色
  bgYellow: (s: string) => `\x1b[43m\x1b[30m${s}\x1b[0m`,
  bgGreen: (s: string) => `\x1b[42m\x1b[30m${s}\x1b[0m`,
  bgRed: (s: string) => `\x1b[41m\x1b[37m${s}\x1b[0m`,
};

// Markdown 主题
const markdownTheme: MarkdownTheme = {
  heading: (text) => theme.bold(theme.accent(text)),
  link: (text) => theme.green(text),
  linkUrl: (text) => theme.dim(text),
  code: (text) => theme.yellow(text),
  codeBlock: (text) => theme.yellow(text),
  codeBlockBorder: (text) => theme.dim(text),
  quote: (text) => theme.accentSoft(text),
  quoteBorder: (text) => theme.dim(text),
  hr: (text) => theme.dim(text),
  listBullet: (text) => theme.accent(text),
  bold: (text) => theme.bold(text),
  italic: (text) => theme.italic(text),
  strikethrough: (text) => theme.strikethrough(text),
  underline: (text) => theme.underline(text),
};

/**
 * 工具调用组件 - 显示单个工具调用的状态
 */
class ToolCallComponent extends Container {
  private statusText: Text;
  private toolName: string;
  private inputPreview: string;
  private status: 'pending' | 'success' | 'error' = 'pending';

  constructor(toolName: string, input: any) {
    super();
    this.toolName = toolName;

    // 简化的输入显示
    const inputStr = JSON.stringify(input);
    this.inputPreview = inputStr.length > 60 ? inputStr.slice(0, 60) + '...' : inputStr;

    this.statusText = new Text(this.formatStatus(), 0, 0);
    this.addChild(this.statusText);
  }

  private formatStatus(): string {
    const icon = this.status === 'pending' ? '⏳' : this.status === 'success' ? '✓' : '✗';
    const color = this.status === 'pending' ? theme.yellow : this.status === 'success' ? theme.green : theme.red;
    return color(`${icon} ${this.toolName}`) + theme.dim(` ${this.inputPreview}`);
  }

  setStatus(status: 'pending' | 'success' | 'error'): void {
    this.status = status;
    this.statusText.setText(this.formatStatus());
  }
}

/**
 * SanBot TUI 主类
 */
export class SanBotPiTUI {
  private tui: TUI;
  private config: TUIConfig;
  private state: TUIState;

  // UI 组件
  private root: Container;
  private header: Text;
  private chatLog: Container;
  private toolCallsContainer: Container;  // 专门的工具调用区域
  private statusContainer: Container;
  private statusText: Text | null = null;
  private statusLoader: Loader | null = null;
  private footer: Text;
  private editor: Editor;
  private terminal: ProcessTerminal;

  // 流式处理
  private streamAssembler: StreamAssembler;
  private currentAssistantMessage: Markdown | null = null;

  // 工具调用追踪
  private toolCallComponents: Map<string, ToolCallComponent> = new Map();

  // 回调
  public onSubmit?: (text: string) => Promise<void>;
  public onCommand?: (cmd: string) => Promise<void>;

  // 状态追踪
  private lastCtrlCAt = 0;
  private statusStartedAt: number | null = null;
  private statusTimer: NodeJS.Timeout | null = null;

  constructor(config: TUIConfig) {
    this.config = config;
    this.state = {
      messages: [],
      currentStream: null,
      toolCalls: [],
      isStreaming: false,
      status: 'idle',
    };
    this.streamAssembler = new StreamAssembler();

    // 创建终端和 TUI
    this.terminal = new ProcessTerminal();
    this.tui = new TUI(this.terminal);

    // 创建组件
    this.header = new Text('', 1, 0);
    this.chatLog = new Container();
    this.toolCallsContainer = new Container();  // 工具调用专用区域
    this.statusContainer = new Container();
    this.footer = new Text('', 1, 0);
    this.editor = new Editor(this.tui, {
      borderColor: theme.accent,
      placeholderColor: theme.dim,
      placeholder: 'Type your message... (Enter to submit)',
    });

    // 组装 UI - 工具调用区域在状态栏上方
    this.root = new Container();
    this.root.addChild(this.header);
    this.root.addChild(new Spacer(1));
    this.root.addChild(this.chatLog);
    this.root.addChild(this.toolCallsContainer);  // 工具调用区域
    this.root.addChild(this.statusContainer);
    this.root.addChild(this.footer);
    this.root.addChild(this.editor);

    this.tui.addChild(this.root);
    this.tui.setFocus(this.editor);

    // 设置编辑器回调
    this.setupEditorCallbacks();

    // 设置 SIGINT 处理（Ctrl+C）
    this.setupSignalHandlers();

    // 初始化显示
    this.updateHeader();
    this.updateFooter();
    this.setStatus('idle');
  }

  /**
   * 设置信号处理器
   */
  private setupSignalHandlers(): void {
    // 处理 Ctrl+C (SIGINT)
    process.on('SIGINT', () => {
      const now = Date.now();

      // 双击 Ctrl+C 退出
      if (now - this.lastCtrlCAt < 1000) {
        this.stop();
        process.exit(0);
      }

      this.lastCtrlCAt = now;
      this.setStatus('press ctrl+c again to exit');
      this.tui.requestRender();
    });
  }

  /**
   * 设置编辑器回调
   */
  private setupEditorCallbacks(): void {
    this.editor.onSubmit = (text: string) => {
      const value = text.trim();
      this.editor.setText('');

      if (!value) return;

      // 添加到历史
      this.editor.addToHistory(value);

      // 处理命令
      if (value.startsWith('/')) {
        if (this.onCommand) {
          void this.onCommand(value);
        }
        return;
      }

      // 发送消息
      if (this.onSubmit) {
        void this.onSubmit(value);
      }
    };
  }

  /**
   * 更新 Header
   */
  private updateHeader(): void {
    const sessionLabel = this.config.sessionId.slice(0, 8);
    this.header.setText(
      theme.bold(theme.accent(`🤖 SanBot`)) +
      theme.dim(` - session ${sessionLabel} - model ${this.config.model}`)
    );
  }

  /**
   * 更新 Footer
   */
  private updateFooter(): void {
    const parts = [
      `session ${this.config.sessionId.slice(0, 8)}`,
      `model ${this.config.model}`,
      this.config.showThinking ? 'thinking: on' : null,
    ].filter(Boolean);
    this.footer.setText(theme.dim(parts.join(' | ')));
  }

  /**
   * 设置状态
   */
  setStatus(status: string): void {
    this.state.status = status;

    const busyStates = new Set(['sending', 'waiting', 'streaming', 'thinking']);
    const isBusy = busyStates.has(status);

    if (isBusy) {
      this.statusStartedAt = this.statusStartedAt || Date.now();
      this.ensureStatusLoader();
      this.startStatusTimer();
      this.updateBusyStatus();
    } else {
      this.statusStartedAt = null;
      this.stopStatusTimer();
      this.statusLoader?.stop();
      this.statusLoader = null;
      this.ensureStatusText();
      this.statusText?.setText(theme.dim(status));
    }
  }

  /**
   * 确保状态文本组件存在
   */
  private ensureStatusText(): void {
    if (this.statusText) return;
    this.statusContainer.clear();
    this.statusLoader?.stop();
    this.statusLoader = null;
    this.statusText = new Text('', 1, 0);
    this.statusContainer.addChild(this.statusText);
  }

  /**
   * 确保状态加载器存在
   */
  private ensureStatusLoader(): void {
    if (this.statusLoader) return;
    this.statusContainer.clear();
    this.statusText = null;
    this.statusLoader = new Loader(
      this.tui,
      (spinner) => theme.accent(spinner),
      (text) => theme.bold(theme.accentSoft(text)),
      ''
    );
    this.statusContainer.addChild(this.statusLoader);
  }

  /**
   * 格式化耗时
   */
  private formatElapsed(startMs: number): string {
    const totalSeconds = Math.max(0, Math.floor((Date.now() - startMs) / 1000));
    if (totalSeconds < 60) return `${totalSeconds}s`;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}m ${seconds}s`;
  }

  /**
   * 更新忙碌状态
   */
  private updateBusyStatus(): void {
    if (!this.statusLoader || !this.statusStartedAt) return;
    const elapsed = this.formatElapsed(this.statusStartedAt);
    this.statusLoader.setMessage(`${this.state.status} • ${elapsed}`);
  }

  /**
   * 启动状态计时器
   */
  private startStatusTimer(): void {
    if (this.statusTimer) return;
    this.statusTimer = setInterval(() => {
      this.updateBusyStatus();
    }, 1000);
  }

  /**
   * 停止状态计时器
   */
  private stopStatusTimer(): void {
    if (!this.statusTimer) return;
    clearInterval(this.statusTimer);
    this.statusTimer = null;
  }

  /**
   * 添加用户消息
   */
  addUserMessage(text: string): void {
    const message: ChatMessage = {
      role: 'user',
      content: text,
      timestamp: new Date(),
    };
    this.state.messages.push(message);

    // 添加到 chatLog
    const container = new Container();
    const header = new Text(theme.user('👤 You') + theme.dim(`  ${message.timestamp.toLocaleTimeString()}`), 1, 0);
    const content = new Markdown(text, 1, 0, markdownTheme);
    container.addChild(header);
    container.addChild(content);
    container.addChild(new Spacer(1));
    this.chatLog.addChild(container);

    this.tui.requestRender();
  }

  /**
   * 开始助手消息（流式）
   */
  startAssistantMessage(): void {
    this.state.isStreaming = true;
    this.streamAssembler.reset();

    // 创建消息容器
    const container = new Container();
    const header = new Text(theme.assistant('🤖 SanBot') + theme.dim(`  ${new Date().toLocaleTimeString()}`), 1, 0);
    this.currentAssistantMessage = new Markdown('', 1, 0, markdownTheme);
    container.addChild(header);
    container.addChild(this.currentAssistantMessage);
    container.addChild(new Spacer(1));
    this.chatLog.addChild(container);

    this.tui.requestRender();
  }

  /**
   * 追加助手消息内容
   */
  appendAssistantMessage(delta: string): void {
    // 防御性检查
    if (!this.currentAssistantMessage) return;
    if (delta == null || delta === '') return;

    this.streamAssembler.ingestText(delta);
    const displayText = this.streamAssembler.getDisplayText(this.config.showThinking ?? false);
    this.currentAssistantMessage.setText(displayText);

    this.tui.requestRender();
  }

  /**
   * 结束助手消息
   */
  endAssistantMessage(): string {
    this.state.isStreaming = false;
    const content = this.streamAssembler.getText();

    // 保存到消息历史
    const message: ChatMessage = {
      role: 'assistant',
      content,
      timestamp: new Date(),
      thinking: this.streamAssembler.getThinking() || undefined,
    };
    this.state.messages.push(message);

    this.currentAssistantMessage = null;
    this.tui.requestRender();

    return content;
  }

  /**
   * 添加系统消息
   */
  addSystemMessage(text: string): void {
    const container = new Container();
    const content = new Text(theme.dim(`ℹ️ ${text}`), 1, 0);
    container.addChild(content);
    container.addChild(new Spacer(1));
    this.chatLog.addChild(container);

    this.tui.requestRender();
  }

  /**
   * 添加工具调用 - 显示在专门的工具调用区域
   */
  addToolCall(tool: ToolCall): void {
    this.state.toolCalls.push(tool);

    // 创建工具调用组件
    const component = new ToolCallComponent(tool.name, tool.input);
    this.toolCallComponents.set(tool.id, component);
    this.toolCallsContainer.addChild(component);

    this.tui.requestRender();
  }

  /**
   * 更新工具调用状态
   */
  updateToolCall(id: string, updates: Partial<ToolCall>): void {
    const tool = this.state.toolCalls.find(t => t.id === id);
    if (tool) {
      Object.assign(tool, updates);

      // 更新组件状态
      const component = this.toolCallComponents.get(id);
      if (component && updates.status) {
        component.setStatus(updates.status);
      }

      this.tui.requestRender();
    }
  }

  /**
   * 清除工具调用 - 清空工具调用区域
   */
  clearToolCalls(): void {
    this.state.toolCalls = [];
    this.toolCallComponents.clear();
    this.toolCallsContainer.clear();
    this.tui.requestRender();
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
    this.stopStatusTimer();
    this.statusLoader?.stop();
    this.tui.stop();
  }

  /**
   * 请求重新渲染
   */
  requestRender(): void {
    this.tui.requestRender();
  }

  /**
   * 获取 TUI 实例
   */
  getTUI(): TUI {
    return this.tui;
  }
}
