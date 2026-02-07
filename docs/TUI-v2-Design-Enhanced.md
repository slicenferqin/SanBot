# SanBot TUI v2.0 增强设计方案

> 基于对 OpenCode、Claude Code、Ink 生态系统的深入研究

## 研究总结

### 技术栈对比

| 项目 | 技术栈 | 架构模式 | 优势 | 劣势 |
|------|--------|----------|------|------|
| **OpenCode** | Go + Bubbletea | MVU (Model-View-Update) | 高性能、编译型、跨平台 | 学习曲线陡、与 SanBot 技术栈不匹配 |
| **Claude Code** | Node.js + Ink | React 组件化 | 开发体验好、组件丰富、易维护 | 性能略低于 Go |
| **Bubbletea** | Go | Elm Architecture | 函数式、类型安全、高性能 | 需要 Go 语言 |
| **Ink** | TypeScript/JS | React | 熟悉的 React 开发模式、生态丰富 | 运行时开销 |

### 最终选择：Ink (React for Terminal)

**理由**：
1. ✅ 与 SanBot 的 TypeScript/Bun 技术栈完美契合
2. ✅ 使用熟悉的 React 开发模式（组件、hooks、state）
3. ✅ 丰富的组件生态（@inkjs/ui、ink-text-input、ink-spinner 等）
4. ✅ 活跃的社区和大量实战案例
5. ✅ 支持流式输出、动画、主题等高级特性

## 核心组件库

### 官方 Ink 组件

```typescript
import { Box, Text, Newline, Spacer, Static } from 'ink';
import { render, useInput, useApp, useFocus } from 'ink';
```

### @inkjs/ui 组件库（推荐）

```typescript
import {
  Spinner,        // 加载动画
  TextInput,      // 文本输入
  PasswordInput,  // 密码输入
  EmailInput,     // 邮箱输入
  ProgressBar,    // 进度条
  Select,         // 选择器
  MultiSelect,    // 多选器
  Confirm,        // 确认对话框
} from '@inkjs/ui';
```

### 社区组件

```typescript
import TextInput from 'ink-text-input';           // 文本输入（经典）
import Spinner from 'ink-spinner';                // 旋转动画
import SelectInput from 'ink-select-input';       // 选择输入
import BigText from 'ink-big-text';               // 大号文字
import Gradient from 'ink-gradient';              // 渐变效果
import Link from 'ink-link';                      // 可点击链接
import Divider from 'ink-divider';                // 分隔线
import Table from 'ink-table';                    // 表格
```

## 架构设计

### 组件层次结构

```
<App>
  ├── <Header>                    # 顶部状态栏
  │   ├── Logo
  │   ├── SessionInfo
  │   └── StatusIndicators
  │
  ├── <MainContent>               # 主内容区
  │   ├── <ConversationArea>      # 对话区域
  │   │   ├── <MessageList>
  │   │   │   ├── <UserMessage>
  │   │   │   ├── <AssistantMessage>
  │   │   │   └── <StreamingText>
  │   │   └── <ScrollIndicator>
  │   │
  │   └── <ToolCallsPanel>        # 工具调用面板
  │       └── <ToolCallItem>[]
  │           ├── <ToolHeader>
  │           ├── <ToolInput>
  │           ├── <ToolOutput>
  │           └── <ToolStatus>
  │
  ├── <InputArea>                 # 输入区域
  │   ├── <TextInput>
  │   ├── <InputHints>
  │   └── <ShortcutBar>
  │
  └── <StatusBar>                 # 底部状态栏
      ├── <StepCounter>
      ├── <TokenCounter>
      └── <NetworkStatus>
```

### 状态管理

使用 React Context + Hooks：

```typescript
// contexts/AppContext.tsx
interface AppState {
  messages: Message[];
  toolCalls: ToolCall[];
  isStreaming: boolean;
  currentStep: number;
  maxSteps: number;
  sessionId: string;
  model: string;
}

const AppContext = createContext<AppState | null>(null);

// hooks/useConversation.ts
export function useConversation() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);

  const addMessage = useCallback((message: Message) => {
    setMessages(prev => [...prev, message]);
  }, []);

  const streamText = useCallback((text: string) => {
    // 流式添加文本
  }, []);

  return { messages, isStreaming, addMessage, streamText };
}

// hooks/useToolCalls.ts
export function useToolCalls() {
  const [toolCalls, setToolCalls] = useState<ToolCall[]>([]);

  const addToolCall = useCallback((call: ToolCall) => {
    setToolCalls(prev => [...prev, call]);
  }, []);

  const updateToolCall = useCallback((id: string, updates: Partial<ToolCall>) => {
    setToolCalls(prev => prev.map(call =>
      call.id === id ? { ...call, ...updates } : call
    ));
  }, []);

  return { toolCalls, addToolCall, updateToolCall };
}
```

## 核心组件实现

### 1. Header 组件

```typescript
// components/Header.tsx
import React from 'react';
import { Box, Text } from 'ink';
import Gradient from 'ink-gradient';
import BigText from 'ink-big-text';

interface HeaderProps {
  sessionId: string;
  model: string;
  memoryEnabled: boolean;
  toolCount: number;
}

export const Header: React.FC<HeaderProps> = ({
  sessionId,
  model,
  memoryEnabled,
  toolCount,
}) => {
  return (
    <Box
      borderStyle="round"
      borderColor="cyan"
      paddingX={1}
      flexDirection="column"
    >
      <Box>
        <Gradient name="rainbow">
          <BigText text="SanBot" font="tiny" />
        </Gradient>
      </Box>

      <Box marginTop={1}>
        <Text color="gray">Session: </Text>
        <Text color="cyan">{sessionId.slice(0, 8)}</Text>

        <Text color="gray"> | Model: </Text>
        <Text color="yellow">{model}</Text>

        <Text color="gray"> | Memory: </Text>
        <Text color={memoryEnabled ? 'green' : 'red'}>
          {memoryEnabled ? '✓' : '✗'}
        </Text>

        <Text color="gray"> | Tools: </Text>
        <Text color="magenta">{toolCount}</Text>
      </Box>
    </Box>
  );
};
```

### 2. ConversationArea 组件

```typescript
// components/ConversationArea.tsx
import React, { useEffect, useRef } from 'react';
import { Box, Text, useInput } from 'ink';
import { useConversation } from '../hooks/useConversation';

export const ConversationArea: React.FC = () => {
  const { messages, isStreaming, streamBuffer } = useConversation();
  const scrollRef = useRef<HTMLDivElement>(null);

  // 自动滚动到底部
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streamBuffer]);

  return (
    <Box
      flexDirection="column"
      flexGrow={1}
      paddingX={1}
      paddingY={1}
    >
      {messages.map((msg, i) => (
        <MessageItem key={i} message={msg} />
      ))}

      {isStreaming && (
        <Box marginTop={1}>
          <Text color="cyan">🤖 SanBot: </Text>
          <StreamingText text={streamBuffer} />
        </Box>
      )}
    </Box>
  );
};

// components/MessageItem.tsx
interface MessageItemProps {
  message: Message;
}

const MessageItem: React.FC<MessageItemProps> = ({ message }) => {
  const icon = message.role === 'user' ? '👤' : '🤖';
  const color = message.role === 'user' ? 'green' : 'cyan';
  const name = message.role === 'user' ? 'You' : 'SanBot';

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box>
        <Text color={color} bold>
          {icon} {name}:{' '}
        </Text>
        <Text>{message.content}</Text>
      </Box>

      {message.timestamp && (
        <Text color="gray" dimColor>
          {new Date(message.timestamp).toLocaleTimeString()}
        </Text>
      )}
    </Box>
  );
};

// components/StreamingText.tsx
const StreamingText: React.FC<{ text: string }> = ({ text }) => {
  const [displayText, setDisplayText] = useState('');
  const [cursor, setCursor] = useState(0);

  useEffect(() => {
    if (cursor < text.length) {
      const timer = setTimeout(() => {
        setDisplayText(text.slice(0, cursor + 1));
        setCursor(cursor + 1);
      }, 10); // 打字机效果速度

      return () => clearTimeout(timer);
    }
  }, [text, cursor]);

  return (
    <Text>
      {displayText}
      <Text color="cyan">▊</Text> {/* 闪烁光标 */}
    </Text>
  );
};
```

### 3. ToolCallsPanel 组件

```typescript
// components/ToolCallsPanel.tsx
import React from 'react';
import { Box, Text } from 'ink';
import { Spinner } from '@inkjs/ui';
import { useToolCalls } from '../hooks/useToolCalls';

export const ToolCallsPanel: React.FC = () => {
  const { toolCalls } = useToolCalls();

  if (toolCalls.length === 0) return null;

  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderColor="yellow"
      paddingX={1}
      paddingY={1}
      marginY={1}
    >
      <Text bold color="yellow">
        🔧 Tool Calls
      </Text>

      {toolCalls.map((call) => (
        <ToolCallItem key={call.id} call={call} />
      ))}
    </Box>
  );
};

// components/ToolCallItem.tsx
interface ToolCallItemProps {
  call: ToolCall;
}

const ToolCallItem: React.FC<ToolCallItemProps> = ({ call }) => {
  const statusIcon = {
    pending: '⏳',
    running: <Spinner label="" />,
    success: '✅',
    error: '❌',
    cancelled: '⊘',
  }[call.status];

  const statusColor = {
    pending: 'gray',
    running: 'yellow',
    success: 'green',
    error: 'red',
    cancelled: 'gray',
  }[call.status];

  return (
    <Box flexDirection="column" marginTop={1}>
      <Box>
        {typeof statusIcon === 'string' ? (
          <Text>{statusIcon} </Text>
        ) : (
          statusIcon
        )}
        <Text color={statusColor} bold>
          {call.name}
        </Text>
        {call.duration && (
          <Text color="gray"> ({call.duration}ms)</Text>
        )}
      </Box>

      {call.status === 'running' && call.input && (
        <Box marginLeft={2}>
          <Text color="gray" dimColor>
            Input: {JSON.stringify(call.input).slice(0, 50)}...
          </Text>
        </Box>
      )}

      {call.status === 'success' && call.output && (
        <Box marginLeft={2}>
          <Text color="green" dimColor>
            ✓ Completed
          </Text>
        </Box>
      )}

      {call.status === 'error' && call.error && (
        <Box marginLeft={2}>
          <Text color="red">
            Error: {call.error}
          </Text>
        </Box>
      )}
    </Box>
  );
};
```

### 4. InputArea 组件

```typescript
// components/InputArea.tsx
import React, { useState } from 'react';
import { Box, Text } from 'ink';
import { TextInput } from '@inkjs/ui';
import { useConversation } from '../hooks/useConversation';

export const InputArea: React.FC = () => {
  const [input, setInput] = useState('');
  const { sendMessage, isStreaming } = useConversation();

  const handleSubmit = () => {
    if (input.trim() && !isStreaming) {
      sendMessage(input);
      setInput('');
    }
  };

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="green"
      paddingX={1}
      paddingY={1}
    >
      <Box>
        <Text color="green" bold>
          {'> '}
        </Text>
        <TextInput
          value={input}
          onChange={setInput}
          onSubmit={handleSubmit}
          placeholder={isStreaming ? 'Waiting...' : 'Type your message...'}
          isDisabled={isStreaming}
        />
      </Box>

      <Box marginTop={1}>
        <Text color="gray" dimColor>
          [Enter] Send  [Tab] Autocomplete  [↑↓] History  [Ctrl+C] Cancel  [Ctrl+D] Exit
        </Text>
      </Box>
    </Box>
  );
};
```

### 5. StatusBar 组件

```typescript
// components/StatusBar.tsx
import React from 'react';
import { Box, Text } from 'ink';
import { useApp } from '../hooks/useApp';

export const StatusBar: React.FC = () => {
  const { currentStep, maxSteps, tokenCount, networkStatus } = useApp();

  return (
    <Box
      borderStyle="single"
      borderColor="gray"
      paddingX={1}
    >
      <Text color="gray">Steps: </Text>
      <Text color={currentStep >= maxSteps ? 'red' : 'cyan'}>
        {currentStep}/{maxSteps}
      </Text>

      <Text color="gray"> | Tokens: </Text>
      <Text color="yellow">{tokenCount}</Text>

      <Text color="gray"> | Network: </Text>
      <Text color={networkStatus === 'online' ? 'green' : 'red'}>
        {networkStatus === 'online' ? '🟢' : '🔴'}
      </Text>
    </Box>
  );
};
```

## 高级特性

### 1. 快捷键系统

```typescript
// hooks/useKeyboard.ts
import { useInput } from 'ink';
import { useApp } from './useApp';

export function useKeyboard() {
  const { exit, clearHistory, showHelp, showTools } = useApp();

  useInput((input, key) => {
    // Ctrl+C: 中断
    if (key.ctrl && input === 'c') {
      exit();
    }

    // Ctrl+L: 清空历史
    if (key.ctrl && input === 'l') {
      clearHistory();
    }

    // Ctrl+H: 显示帮助
    if (key.ctrl && input === 'h') {
      showHelp();
    }

    // Ctrl+T: 显示工具列表
    if (key.ctrl && input === 't') {
      showTools();
    }

    // i: 查看工具详情（当有选中的工具时）
    if (input === 'i') {
      // showToolDetails();
    }
  });
}
```

### 2. 主题系统

```typescript
// themes/index.ts
export interface Theme {
  colors: {
    primary: string;
    success: string;
    error: string;
    warning: string;
    info: string;
    muted: string;
  };
  borders: {
    style: 'single' | 'double' | 'round' | 'bold';
    color: string;
  };
}

export const themes: Record<string, Theme> = {
  default: {
    colors: {
      primary: 'cyan',
      success: 'green',
      error: 'red',
      warning: 'yellow',
      info: 'blue',
      muted: 'gray',
    },
    borders: {
      style: 'round',
      color: 'cyan',
    },
  },

  dracula: {
    colors: {
      primary: '#bd93f9',
      success: '#50fa7b',
      error: '#ff5555',
      warning: '#f1fa8c',
      info: '#8be9fd',
      muted: '#6272a4',
    },
    borders: {
      style: 'round',
      color: '#bd93f9',
    },
  },

  nord: {
    colors: {
      primary: '#88c0d0',
      success: '#a3be8c',
      error: '#bf616a',
      warning: '#ebcb8b',
      info: '#81a1c1',
      muted: '#4c566a',
    },
    borders: {
      style: 'single',
      color: '#88c0d0',
    },
  },
};

// contexts/ThemeContext.tsx
const ThemeContext = createContext<Theme>(themes.default);

export const ThemeProvider: React.FC<{ theme: string; children: ReactNode }> = ({
  theme,
  children,
}) => {
  const selectedTheme = themes[theme] || themes.default;

  return (
    <ThemeContext.Provider value={selectedTheme}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);
```

### 3. 工具详情弹窗

```typescript
// components/ToolDetailsModal.tsx
import React from 'react';
import { Box, Text } from 'ink';

interface ToolDetailsModalProps {
  tool: ToolCall;
  onClose: () => void;
}

export const ToolDetailsModal: React.FC<ToolDetailsModalProps> = ({
  tool,
  onClose,
}) => {
  return (
    <Box
      position="absolute"
      top={5}
      left={10}
      width={60}
      borderStyle="double"
      borderColor="cyan"
      paddingX={2}
      paddingY={1}
      flexDirection="column"
    >
      <Text bold color="cyan">
        Tool Call Details
      </Text>

      <Box marginTop={1} flexDirection="column">
        <Text color="gray">Name: </Text>
        <Text>{tool.name}</Text>

        <Text color="gray" marginTop={1}>Status: </Text>
        <Text color={tool.status === 'success' ? 'green' : 'red'}>
          {tool.status}
        </Text>

        <Text color="gray" marginTop={1}>Duration: </Text>
        <Text>{tool.duration}ms</Text>

        <Text color="gray" marginTop={1}>Input: </Text>
        <Box borderStyle="single" paddingX={1} marginTop={1}>
          <Text>{JSON.stringify(tool.input, null, 2)}</Text>
        </Box>

        {tool.output && (
          <>
            <Text color="gray" marginTop={1}>Output: </Text>
            <Box borderStyle="single" paddingX={1} marginTop={1}>
              <Text>{JSON.stringify(tool.output, null, 2)}</Text>
            </Box>
          </>
        )}
      </Box>

      <Box marginTop={1}>
        <Text color="gray" dimColor>
          [Press ESC to close]
        </Text>
      </Box>
    </Box>
  );
};
```

## 依赖包清单

```json
{
  "dependencies": {
    // 核心
    "ink": "^5.0.1",
    "react": "^18.3.1",

    // 官方 UI 组件
    "@inkjs/ui": "^2.0.0",

    // 社区组件
    "ink-text-input": "^6.0.0",
    "ink-spinner": "^5.0.0",
    "ink-select-input": "^6.0.0",
    "ink-big-text": "^2.0.0",
    "ink-gradient": "^3.0.0",
    "ink-link": "^4.0.0",
    "ink-divider": "^4.0.0",
    "ink-table": "^3.1.0",

    // 工具库
    "chalk": "^5.3.0",
    "cli-boxes": "^3.0.0",
    "figures": "^6.1.0"
  },
  "devDependencies": {
    "@types/react": "^18.3.0",
    "@types/node": "^20.0.0"
  }
}
```

## 实现路线图

### Phase 1: 基础框架 (2-3 天)
- [x] 研究 Ink 和相关组件库
- [ ] 安装依赖并配置项目
- [ ] 创建基础 Layout 组件
- [ ] 实现 Header 和 StatusBar
- [ ] 集成到现有 Agent

### Phase 2: 核心功能 (3-4 天)
- [ ] ConversationArea 滚动和渲染
- [ ] MessageItem 组件和 Markdown 支持
- [ ] ToolCallsPanel 实时更新
- [ ] InputArea 多行输入和历史
- [ ] 流式输出动画（StreamingText）

### Phase 3: 高级特性 (2-3 天)
- [ ] 快捷键系统（useKeyboard hook）
- [ ] 工具详情弹窗
- [ ] 主题系统（ThemeProvider）
- [ ] 自动补全功能
- [ ] 历史记录导航

### Phase 4: 优化和测试 (2-3 天)
- [ ] 性能优化（虚拟滚动、memo）
- [ ] 错误处理和边界情况
- [ ] 用户体验打磨
- [ ] 单元测试
- [ ] 文档完善

## 参考资源

### 官方文档
- Ink: https://github.com/vadimdemedes/ink
- @inkjs/ui: https://github.com/vadimdemedes/ink-ui
- Bubbletea: https://github.com/charmbracelet/bubbletea
- Bubbles: https://github.com/charmbracelet/bubbles

### 实战案例
- Ivan Leo 的 Coding Agent: https://ivanleo.com/blog/migrating-to-react-ink
- OpenCode: https://github.com/anomalyco/opencode
- Glow: https://github.com/charmbracelet/glow

### 教程
- Building CLIs with Ink: https://vadimdemedes.com/posts/building-rich-command-line-interfaces-with-ink-and-react
- Bubbletea Tutorial: https://www.inngest.com/blog/interactive-clis-with-bubbletea

## 设计原则

1. **简洁优先**: 不过度设计，保持界面清晰
2. **响应式**: 适配不同终端尺寸
3. **可访问性**: 支持屏幕阅读器和键盘导航
4. **性能**: 流畅的动画和快速响应
5. **可扩展**: 易于添加新功能和组件
6. **一致性**: 统一的视觉语言和交互模式

## 预期效果

完成后的 TUI 应该：
- ✅ 比当前版本更直观、更美观
- ✅ 实时显示工具调用状态（pending/running/success/error）
- ✅ 支持流式输出和打字机动画
- ✅ 提供丰富的交互功能（快捷键、弹窗、主题）
- ✅ 保持高性能和稳定性
- ✅ 易于维护和扩展
