# SanBot TUI v3.0 - 基于 pi-tui 的轻量级设计

> 参考 pi-tui 的极简设计理念，打造高性能、无依赖的 TUI

## 为什么选择 pi-tui 风格？

### pi-tui 的核心优势

1. **零依赖**：不依赖 React/Ink，直接操作终端
2. **差分渲染**：只更新变化的行，性能极佳
3. **同步输出**：使用 CSI 2026 实现无闪烁渲染
4. **简单接口**：Component 只需实现 `render(width): string[]`
5. **内置组件丰富**：Text、Editor、Markdown、SelectList、Image 等
6. **IME 支持**：通过 CURSOR_MARKER 实现正确的光标定位

### 与 Ink 对比

| 特性 | pi-tui | Ink |
|------|--------|-----|
| 依赖 | 零依赖 | React + 多个组件库 |
| 性能 | 差分渲染，极快 | React reconciliation，较慢 |
| 包大小 | ~50KB | ~500KB+ |
| 学习曲线 | 简单（render 函数） | 需要懂 React |
| 组件 | 内置丰富 | 需要安装多个包 |
| 流式输出 | 原生支持 | 需要自己实现 |

## 架构设计

### 核心接口

```typescript
// src/tui/core/component.ts
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
 * 可聚焦组件接口（支持 IME）
 */
export interface Focusable {
  focused: boolean;
}

/**
 * 光标位置标记（零宽度 APC 序列）
 */
export const CURSOR_MARKER = "\x1b_sanbot:cursor\x07";
```

### 组件层次

```
TUI (Container)
├── Header
│   ├── Logo (Text)
│   └── StatusLine (TruncatedText)
│
├── ConversationArea (Container)
│   ├── MessageList (Container)
│   │   ├── UserMessage (Text + Markdown)
│   │   ├── AssistantMessage (Text + Markdown)
│   │   └── StreamingMessage (Text)
│   └── ScrollIndicator (Text)
│
├── ToolCallsPanel (Container)
│   └── ToolCallItem[] (Box + Text + Loader)
│
├── InputArea (Editor)
│   └── AutocompleteList (SelectList)
│
└── StatusBar (TruncatedText)
```

## 核心组件实现

### 1. TUI 主类

```typescript
// src/tui/core/tui.ts
import { ProcessTerminal, type Terminal } from './terminal';
import { Component, Container } from './component';

export class TUI extends Container {
  private terminal: Terminal;
  private previousLines: string[] = [];
  private previousWidth: number = 0;
  private focusedComponent: Component | null = null;

  constructor(terminal: Terminal = new ProcessTerminal()) {
    super();
    this.terminal = terminal;
  }

  start(): void {
    this.terminal.start(
      (data) => this.handleInput(data),
      () => this.requestRender()
    );
    this.requestRender();
  }

  stop(): void {
    this.terminal.stop();
  }

  requestRender(): void {
    const width = this.terminal.columns;
    const lines = this.render(width);

    // 差分渲染
    this.differentialRender(lines, width);

    this.previousLines = lines;
    this.previousWidth = width;
  }

  private differentialRender(lines: string[], width: number): void {
    const prev = this.previousLines;

    // 首次渲染或宽度变化：全量渲染
    if (prev.length === 0 || width !== this.previousWidth) {
      this.terminal.clearScreen();
      this.terminal.write(lines.join('\n'));
      return;
    }

    // 找到第一个不同的行
    let firstDiff = 0;
    while (firstDiff < Math.min(prev.length, lines.length)) {
      if (prev[firstDiff] !== lines[firstDiff]) break;
      firstDiff++;
    }

    // 没有变化
    if (firstDiff === prev.length && firstDiff === lines.length) {
      return;
    }

    // 移动到第一个变化的行，清除到末尾，输出新内容
    this.terminal.moveBy(firstDiff - prev.length);
    this.terminal.clearFromCursor();
    this.terminal.write(lines.slice(firstDiff).join('\n'));
  }

  private handleInput(data: string): void {
    if (this.focusedComponent?.handleInput) {
      this.focusedComponent.handleInput(data);
      this.requestRender();
    }
  }

  setFocus(component: Component | null): void {
    this.focusedComponent = component;
  }
}
```

### 2. Header 组件

```typescript
// src/tui/components/header.ts
import { Component } from '../core/component';
import { visibleWidth, truncateToWidth } from '../utils';
import chalk from 'chalk';

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

  invalidate(): void {}

  render(width: number): string[] {
    const { sessionId, model, memoryEnabled, toolCount } = this.props;

    // Logo 行
    const logo = chalk.cyan.bold('🤖 SanBot');

    // 状态行
    const status = [
      chalk.gray('Session:'),
      chalk.cyan(sessionId.slice(0, 8)),
      chalk.gray('|'),
      chalk.gray('Model:'),
      chalk.yellow(model),
      chalk.gray('|'),
      chalk.gray('Memory:'),
      memoryEnabled ? chalk.green('✓') : chalk.red('✗'),
      chalk.gray('|'),
      chalk.gray('Tools:'),
      chalk.magenta(toolCount.toString()),
    ].join(' ');

    const border = chalk.cyan('─'.repeat(width));

    return [
      truncateToWidth(logo, width),
      truncateToWidth(status, width),
      border,
    ];
  }
}
```

### 3. MessageItem 组件

```typescript
// src/tui/components/message-item.ts
import { Component } from '../core/component';
import { Text } from './text';
import { Markdown } from './markdown';
import chalk from 'chalk';

export interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
}

export class MessageItem implements Component {
  private textComponent: Text | Markdown;

  constructor(private message: Message, private useMarkdown: boolean = true) {
    const icon = message.role === 'user' ? '👤' : '🤖';
    const name = message.role === 'user' ? 'You' : 'SanBot';
    const color = message.role === 'user' ? chalk.green : chalk.cyan;

    const header = color.bold(`${icon} ${name}:`);
    const content = useMarkdown
      ? message.content
      : `${header} ${message.content}`;

    this.textComponent = useMarkdown
      ? new Markdown(content, 1, 0)
      : new Text(content, 1, 0);
  }

  invalidate(): void {
    this.textComponent.invalidate?.();
  }

  render(width: number): string[] {
    const lines = this.textComponent.render(width);

    // 添加时间戳
    if (this.message.timestamp) {
      const time = new Date(this.message.timestamp).toLocaleTimeString();
      lines.push(chalk.gray.dim(`  ${time}`));
    }

    return lines;
  }
}
```

### 4. ToolCallItem 组件

```typescript
// src/tui/components/tool-call-item.ts
import { Component } from '../core/component';
import { Box } from './box';
import { Text } from './text';
import { Loader } from './loader';
import chalk from 'chalk';

export interface ToolCall {
  id: string;
  name: string;
  status: 'pending' | 'running' | 'success' | 'error' | 'cancelled';
  input?: any;
  output?: any;
  error?: string;
  duration?: number;
}

export class ToolCallItem implements Component {
  private loader?: Loader;

  constructor(
    private call: ToolCall,
    private tui: any // TUI instance for loader
  ) {
    if (call.status === 'running') {
      this.loader = new Loader(
        tui,
        (s) => chalk.yellow(s),
        (s) => chalk.gray(s),
        `${call.name}...`
      );
      this.loader.start();
    }
  }

  update(call: ToolCall): void {
    const wasRunning = this.call.status === 'running';
    this.call = call;

    if (wasRunning && call.status !== 'running') {
      this.loader?.stop();
      this.loader = undefined;
    } else if (!wasRunning && call.status === 'running') {
      this.loader = new Loader(
        this.tui,
        (s) => chalk.yellow(s),
        (s) => chalk.gray(s),
        `${call.name}...`
      );
      this.loader.start();
    }
  }

  invalidate(): void {
    this.loader?.invalidate?.();
  }

  render(width: number): string[] {
    const { name, status, duration, error } = this.call;

    const statusIcon = {
      pending: '⏳',
      running: '⚙️',
      success: '✅',
      error: '❌',
      cancelled: '⊘',
    }[status];

    const statusColor = {
      pending: chalk.gray,
      running: chalk.yellow,
      success: chalk.green,
      error: chalk.red,
      cancelled: chalk.gray,
    }[status];

    const lines: string[] = [];

    // 状态行
    if (status === 'running' && this.loader) {
      lines.push(...this.loader.render(width));
    } else {
      const statusLine = [
        statusIcon,
        statusColor.bold(name),
        duration ? chalk.gray(`(${duration}ms)`) : '',
      ].filter(Boolean).join(' ');
      lines.push(statusLine);
    }

    // 错误信息
    if (error) {
      lines.push(chalk.red(`  Error: ${error}`));
    }

    return lines;
  }
}
```

### 5. StreamingText 组件

```typescript
// src/tui/components/streaming-text.ts
import { Component } from '../core/component';
import { Text } from './text';
import chalk from 'chalk';

export class StreamingText implements Component {
  private textComponent: Text;
  private buffer: string = '';

  constructor() {
    this.textComponent = new Text('', 1, 0);
  }

  append(text: string): void {
    this.buffer += text;
    this.textComponent.setText(this.buffer + chalk.cyan('▊')); // 闪烁光标
  }

  clear(): void {
    this.buffer = '';
    this.textComponent.setText('');
  }

  getBuffer(): string {
    return this.buffer;
  }

  invalidate(): void {
    this.textComponent.invalidate?.();
  }

  render(width: number): string[] {
    return this.textComponent.render(width);
  }
}
```

### 6. ConversationArea 组件

```typescript
// src/tui/components/conversation-area.ts
import { Container } from '../core/component';
import { MessageItem, type Message } from './message-item';
import { StreamingText } from './streaming-text';
import { Spacer } from './spacer';

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
    const buffer = this.streamingText?.getBuffer() || '';
    if (this.streamingText) {
      this.removeChild(this.streamingText);
      this.streamingText = null;
    }
    return buffer;
  }
}
```

## 集成到 Agent

```typescript
// src/tui/sanbot-tui.ts
import { TUI } from './core/tui';
import { Header } from './components/header';
import { ConversationArea } from './components/conversation-area';
import { ToolCallsPanel } from './components/tool-calls-panel';
import { Editor } from './components/editor';
import { StatusBar } from './components/status-bar';
import { Spacer } from './components/spacer';

export class SanBotTUI {
  private tui: TUI;
  private header: Header;
  private conversationArea: ConversationArea;
  private toolCallsPanel: ToolCallsPanel;
  private editor: Editor;
  private statusBar: StatusBar;

  constructor(sessionId: string, model: string, toolCount: number) {
    this.tui = new TUI();

    // 创建组件
    this.header = new Header({
      sessionId,
      model,
      memoryEnabled: true,
      toolCount,
    });

    this.conversationArea = new ConversationArea();
    this.toolCallsPanel = new ToolCallsPanel(this.tui);

    this.editor = new Editor(this.tui, {
      borderColor: (s) => chalk.green(s),
      selectList: defaultSelectListTheme,
    });

    this.statusBar = new StatusBar();

    // 组装 UI
    this.tui.addChild(this.header);
    this.tui.addChild(new Spacer(1));
    this.tui.addChild(this.conversationArea);
    this.tui.addChild(this.toolCallsPanel);
    this.tui.addChild(new Spacer(1));
    this.tui.addChild(this.editor);
    this.tui.addChild(this.statusBar);

    // 设置焦点到编辑器
    this.tui.setFocus(this.editor);

    // 绑定事件
    this.editor.onSubmit = (text) => this.handleSubmit(text);
  }

  start(): void {
    this.tui.start();
  }

  stop(): void {
    this.tui.stop();
  }

  addUserMessage(text: string): void {
    this.conversationArea.addMessage({
      role: 'user',
      content: text,
      timestamp: new Date().toISOString(),
    });
    this.tui.requestRender();
  }

  startAssistantMessage(): void {
    this.conversationArea.startStreaming();
  }

  appendAssistantMessage(text: string): void {
    this.conversationArea.appendStream(text);
    this.tui.requestRender();
  }

  endAssistantMessage(): void {
    const content = this.conversationArea.endStreaming();
    this.conversationArea.addMessage({
      role: 'assistant',
      content,
      timestamp: new Date().toISOString(),
    });
    this.tui.requestRender();
  }

  addToolCall(call: ToolCall): void {
    this.toolCallsPanel.addToolCall(call);
    this.tui.requestRender();
  }

  updateToolCall(id: string, updates: Partial<ToolCall>): void {
    this.toolCallsPanel.updateToolCall(id, updates);
    this.tui.requestRender();
  }

  private handleSubmit(text: string): void {
    // 触发 Agent 处理
    this.onSubmit?.(text);
  }

  onSubmit?: (text: string) => void;
}
```

## 使用示例

```typescript
// src/index.ts
import { Agent } from './agent';
import { SanBotTUI } from './tui/sanbot-tui';

async function main() {
  const agent = new Agent({
    llmConfig: {
      provider: 'anthropic',
      model: 'claude-3-5-sonnet-20241022',
      apiKey: process.env.ANTHROPIC_API_KEY!,
    },
  });

  await agent.init();

  const tui = new SanBotTUI(
    agent.sessionId,
    agent.config.llmConfig.model,
    agent.toolRegistry.getAll().length
  );

  // 绑定提交事件
  tui.onSubmit = async (text) => {
    tui.addUserMessage(text);
    tui.startAssistantMessage();

    // 流式处理
    await agent.chatStream(text, {
      onText: (chunk) => tui.appendAssistantMessage(chunk),
      onToolCall: (call) => tui.addToolCall(call),
      onToolUpdate: (id, updates) => tui.updateToolCall(id, updates),
    });

    tui.endAssistantMessage();
  };

  tui.start();
}

main();
```

## 优势总结

1. **零依赖**：不需要 React/Ink，包体积小
2. **高性能**：差分渲染，只更新变化的行
3. **简单**：Component 接口简单，易于扩展
4. **功能完整**：内置 Editor、Markdown、Loader 等组件
5. **流式友好**：原生支持流式输出
6. **IME 支持**：正确的光标定位

## 实现计划

### Phase 1: 核心框架 (1-2 天)
- [ ] 实现 TUI 主类和差分渲染
- [ ] 实现 Terminal 接口
- [ ] 实现 Component 基础接口

### Phase 2: 基础组件 (2-3 天)
- [ ] Text、TruncatedText、Spacer
- [ ] Box、Container
- [ ] Loader、StreamingText

### Phase 3: 高级组件 (2-3 天)
- [ ] Editor（参考 pi-tui）
- [ ] Markdown
- [ ] SelectList

### Phase 4: 集成和优化 (1-2 天)
- [ ] 集成到 Agent
- [ ] 性能优化
- [ ] 测试和调试
