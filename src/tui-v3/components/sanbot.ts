/**
 * TUI v3 - 业务组件
 * SanBot 专用组件
 */

import { type Component, Container } from "../core/component";
import { pc, truncateToWidth } from "../utils";
import { Text, Loader, Spacer } from "./base";

/**
 * 消息接口
 */
export interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp?: string;
}

/**
 * 消息项组件
 */
export class MessageItem implements Component {
  private textComponent: Text;

  constructor(private message: Message) {
    const icon = message.role === "user" ? "👤" : "🤖";
    const name = message.role === "user" ? "You" : "SanBot";
    const color = message.role === "user" ? pc.green : pc.cyan;

    const header = color.bold(`${icon} ${name}:`);
    const content = `${header}\n${message.content}`;

    this.textComponent = new Text(content);
  }

  render(width: number): string[] {
    // 复制数组，避免修改 Text 组件的缓存
    const lines = [...this.textComponent.render(width)];

    // 添加时间戳
    if (this.message.timestamp) {
      const time = new Date(this.message.timestamp).toLocaleTimeString();
      lines.push(pc.gray.dim(`  ${time}`));
    }

    return lines;
  }
}

/**
 * 流式文本组件
 */
export class StreamingText implements Component {
  private textComponent: Text;
  private buffer: string = "";

  constructor() {
    this.textComponent = new Text("");
  }

  append(text: string): void {
    this.buffer += text;
    this.textComponent.setText(this.buffer + pc.cyan("▊"));
  }

  clear(): void {
    this.buffer = "";
    this.textComponent.setText("");
  }

  getBuffer(): string {
    return this.buffer;
  }

  render(width: number): string[] {
    return this.textComponent.render(width);
  }
}

/**
 * 工具调用状态
 */
export interface ToolCall {
  id: string;
  name: string;
  status: "pending" | "running" | "success" | "error" | "cancelled";
  input?: any;
  output?: any;
  error?: string;
  duration?: number;
}

/**
 * 工具调用项组件
 */
export class ToolCallItem implements Component {
  private loader?: Loader;
  private onUpdate?: () => void;
  public call: ToolCall;  // 改为 public 以便 Panel 访问

  constructor(
    call: ToolCall,
    onUpdate?: () => void
  ) {
    this.call = call;
    this.onUpdate = onUpdate;
    if (call.status === "running") {
      this.startLoader();
    }
  }

  private startLoader(): void {
    this.loader = new Loader(
      `${this.call.name}...`,
      pc.yellow,
      pc.gray
    );
    this.loader.start(() => this.onUpdate?.());
  }

  update(updates: Partial<ToolCall>): void {
    const wasRunning = this.call.status === "running";
    this.call = { ...this.call, ...updates };

    if (wasRunning && this.call.status !== "running") {
      this.loader?.stop();
      this.loader = undefined;
    } else if (!wasRunning && this.call.status === "running") {
      this.startLoader();
    }
  }

  render(_width: number): string[] {
    const { name, status, duration, error } = this.call;

    const statusIcon = {
      pending: "⏳",
      running: "⚙️",
      success: "✅",
      error: "❌",
      cancelled: "⊘",
    }[status];

    const statusColor = {
      pending: pc.gray,
      running: pc.yellow,
      success: pc.green,
      error: pc.red,
      cancelled: pc.gray,
    }[status];

    // 如果正在运行且有 loader，使用 loader 的渲染
    if (status === "running" && this.loader) {
      return this.loader.render(_width);
    }

    const lines: string[] = [];

    // 状态行
    const statusLine = [
      statusIcon,
      statusColor.bold(name),
      duration ? pc.gray(`(${duration}ms)`) : "",
    ].filter(Boolean).join(" ");
    lines.push(statusLine);

    // 错误信息
    if (error) {
      lines.push(pc.red(`  Error: ${error}`));
    }

    return lines;
  }
}

/**
 * 对话区域组件
 */
export class ConversationArea extends Container {
  private streamingText: StreamingText | null = null;

  addMessage(message: Message): void {
    this.addChild(new MessageItem(message));
    this.addChild(new Spacer(1));
  }

  startStreaming(): void {
    if (!this.streamingText) {
      this.streamingText = new StreamingText();
      this.addChild(this.streamingText);
    }
  }

  appendStream(text: string): void {
    this.streamingText?.append(text);
  }

  endStreaming(): string {
    const buffer = this.streamingText?.getBuffer() || "";
    if (this.streamingText) {
      this.removeChild(this.streamingText);
      this.streamingText = null;
    }
    return buffer;
  }
}

/**
 * 工具调用面板组件
 */
export class ToolCallsPanel extends Container {
  private toolCallItems = new Map<string, ToolCallItem>();
  private onUpdateCallback?: () => void;

  constructor(onUpdate?: () => void) {
    super();
    this.onUpdateCallback = onUpdate;
  }

  addToolCall(call: ToolCall): void {
    const item = new ToolCallItem(call, () => {
      this.onUpdateCallback?.();
    });
    this.toolCallItems.set(call.id, item);
    this.addChild(item);
  }

  updateToolCall(id: string, updates: Partial<ToolCall>): void {
    const item = this.toolCallItems.get(id);
    if (item) {
      item.update(updates);
    }
  }

  clearToolCalls(): void {
    const items = Array.from(this.toolCallItems.values());
    for (const item of items) {
      this.removeChild(item);
    }
    this.toolCallItems.clear();
  }
}

/**
 * Header 组件
 */
export interface HeaderProps {
  sessionId: string;
  model: string;
  memoryEnabled: boolean;
  toolCount: number;
}

export class Header implements Component {
  constructor(private props: HeaderProps) {}

  updateProps(props: Partial<HeaderProps>): void {
    Object.assign(this.props, props);
  }

  render(width: number): string[] {
    const { sessionId, model, memoryEnabled, toolCount } = this.props;

    // Logo 行
    const logo = pc.cyan.bold("🤖 SanBot");

    // 状态行
    const status = [
      pc.gray("Session:"),
      pc.cyan(sessionId.slice(0, 8)),
      pc.gray("|"),
      pc.gray("Model:"),
      pc.yellow(model),
      pc.gray("|"),
      pc.gray("Memory:"),
      memoryEnabled ? pc.green("✓") : pc.red("✗"),
      pc.gray("|"),
      pc.gray("Tools:"),
      pc.magenta(toolCount.toString()),
    ].join(" ");

    const border = pc.cyan("─".repeat(width));

    return [
      truncateToWidth(logo, width),
      truncateToWidth(status, width),
      border,
    ];
  }
}

/**
 * 状态栏组件
 */
export class StatusBar implements Component {
  constructor(private text: string = "") {}

  setText(text: string): void {
    this.text = text;
  }

  render(width: number): string[] {
    return [truncateToWidth(pc.gray(this.text), width)];
  }
}
