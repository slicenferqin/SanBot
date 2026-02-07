# SanBot TUI v2.0 设计方案

## 技术选型

**框架**: Ink (React for Terminal)
- 官方仓库: https://github.com/vadimdemedes/ink
- 理由: 与 TypeScript/Bun 技术栈完美契合，组件化开发，社区成熟

## 核心组件设计

### 1. Layout 组件

```tsx
<Box flexDirection="column" height="100%">
  <Header />
  <ConversationArea flex={1} />
  <ToolCallsPanel />
  <InputArea />
  <StatusBar />
</Box>
```

### 2. Header 组件

显示会话信息：
- Session ID
- 当前模型
- 记忆状态
- 自定义工具数量

```tsx
<Box borderStyle="round" borderColor="cyan">
  <Text color="cyan">🤖 SanBot</Text>
  <Text dimColor> | </Text>
  <Text>Session: {sessionId}</Text>
  <Text dimColor> | </Text>
  <Text>Model: {model}</Text>
  <Text dimColor> | </Text>
  <Text color="green">Memory: ✓</Text>
  <Text dimColor> | </Text>
  <Text>Tools: {toolCount}</Text>
</Box>
```

### 3. ConversationArea 组件

**特性**:
- 滚动支持（使用 `ink-scroll`）
- 消息分组（用户/助手）
- Markdown 渲染（使用 `ink-markdown`）
- 代码高亮（使用 `ink-syntax-highlight`）
- 流式输出动画

```tsx
<ScrollArea height={height}>
  {messages.map((msg, i) => (
    <Message key={i} role={msg.role} content={msg.content} />
  ))}
  {isStreaming && <StreamingText text={streamBuffer} />}
</ScrollArea>
```

### 4. ToolCallsPanel 组件

**实时显示工具调用状态**:
- 工具名称
- 输入参数（可折叠）
- 执行状态（pending/running/success/error）
- 执行时间
- 结果预览

```tsx
<Box flexDirection="column" borderStyle="single" borderColor="yellow">
  <Text bold color="yellow">🔧 Tool Calls</Text>
  {toolCalls.map((call) => (
    <ToolCallItem
      key={call.id}
      name={call.name}
      status={call.status}
      duration={call.duration}
      input={call.input}
      output={call.output}
    />
  ))}
</Box>
```

**状态图标**:
- ⏳ Pending
- ⚙️ Running (带 spinner)
- ✅ Success
- ❌ Error
- ⊘ Cancelled

### 5. InputArea 组件

**特性**:
- 多行输入支持
- 自动补全（文件路径、工具名称）
- 历史记录（上下箭头）
- 快捷键提示

```tsx
<Box flexDirection="column" borderStyle="round" borderColor="green">
  <TextInput
    value={input}
    onChange={setInput}
    placeholder="Type your message..."
    onSubmit={handleSubmit}
  />
  <Box marginTop={1}>
    <Text dimColor>
      [Tab] Autocomplete  [↑↓] History  [Ctrl+C] Cancel  [Ctrl+D] Exit
    </Text>
  </Box>
</Box>
```

### 6. StatusBar 组件

显示实时状态：
- 当前步骤数 / 最大步骤数
- Token 使用情况
- 网络状态
- 错误提示

```tsx
<Box borderStyle="single" borderColor="gray">
  <Text>Steps: {currentStep}/{maxSteps}</Text>
  <Text dimColor> | </Text>
  <Text>Tokens: {tokenCount}</Text>
  <Text dimColor> | </Text>
  <Text color={networkStatus === 'online' ? 'green' : 'red'}>
    {networkStatus === 'online' ? '🟢' : '🔴'} Network
  </Text>
</Box>
```

## 高级特性

### 1. 分屏模式

```
┌─────────────────┬─────────────────┐
│  Conversation   │   File Preview  │
│                 │                 │
│                 │                 │
│                 │                 │
└─────────────────┴─────────────────┘
```

### 2. 工具调用详情弹窗

按 `i` 键查看工具调用详情：

```
┌─────────────────────────────────────┐
│  Tool Call Details                  │
├─────────────────────────────────────┤
│  Name: read_file                    │
│  Status: ✅ Success                 │
│  Duration: 0.23s                    │
│                                     │
│  Input:                             │
│  {                                  │
│    "path": "src/agent.ts",          │
│    "lines": "1-50"                  │
│  }                                  │
│                                     │
│  Output:                            │
│  [File content preview...]          │
│                                     │
│  [Press ESC to close]               │
└─────────────────────────────────────┘
```

### 3. 快捷键系统

| 快捷键 | 功能 |
|--------|------|
| `Ctrl+C` | 中断当前操作 |
| `Ctrl+D` | 退出 SanBot |
| `Ctrl+L` | 清空对话历史 |
| `Ctrl+R` | 重新加载记忆 |
| `Ctrl+T` | 显示工具列表 |
| `Ctrl+H` | 显示帮助 |
| `↑/↓` | 浏览历史输入 |
| `Tab` | 自动补全 |
| `i` | 查看工具详情 |

### 4. 主题系统

支持自定义主题：

```typescript
const themes = {
  default: {
    primary: 'cyan',
    success: 'green',
    error: 'red',
    warning: 'yellow',
  },
  dracula: {
    primary: '#bd93f9',
    success: '#50fa7b',
    error: '#ff5555',
    warning: '#f1fa8c',
  },
  nord: {
    primary: '#88c0d0',
    success: '#a3be8c',
    error: '#bf616a',
    warning: '#ebcb8b',
  },
};
```

## 依赖包

```json
{
  "dependencies": {
    "ink": "^5.0.0",
    "react": "^18.3.0",
    "ink-text-input": "^6.0.0",
    "ink-select-input": "^6.0.0",
    "ink-spinner": "^5.0.0",
    "ink-markdown": "^2.0.0",
    "ink-syntax-highlight": "^2.0.0",
    "ink-scroll": "^1.0.0",
    "ink-box": "^3.0.0",
    "ink-gradient": "^3.0.0",
    "ink-big-text": "^2.0.0"
  }
}
```

## 实现步骤

### Phase 1: 基础框架 (1-2 天)
- [ ] 安装 Ink 和相关依赖
- [ ] 创建基础 Layout 组件
- [ ] 实现 Header 和 StatusBar
- [ ] 集成到现有 Agent

### Phase 2: 核心功能 (2-3 天)
- [ ] ConversationArea 滚动和渲染
- [ ] ToolCallsPanel 实时更新
- [ ] InputArea 多行输入和历史
- [ ] 流式输出动画

### Phase 3: 高级特性 (2-3 天)
- [ ] 快捷键系统
- [ ] 工具详情弹窗
- [ ] 主题系统
- [ ] 分屏模式

### Phase 4: 优化和测试 (1-2 天)
- [ ] 性能优化
- [ ] 错误处理
- [ ] 用户体验打磨
- [ ] 文档完善

## 参考项目

1. **Ink 官方示例**: https://github.com/vadimdemedes/ink
2. **Jest CLI**: 使用 Ink 构建的测试框架 UI
3. **Gatsby CLI**: 使用 Ink 的构建工具
4. **OpenCode TUI**: Go + Bubbletea 实现参考

## 设计原则

1. **简洁优先**: 不要过度设计，保持界面清晰
2. **响应式**: 适配不同终端尺寸
3. **可访问性**: 支持屏幕阅读器
4. **性能**: 流畅的动画和快速响应
5. **可扩展**: 易于添加新功能和组件

## 预期效果

完成后的 TUI 应该：
- ✅ 比当前版本更直观、更美观
- ✅ 实时显示工具调用状态
- ✅ 支持流式输出和动画
- ✅ 提供丰富的交互功能
- ✅ 保持高性能和稳定性
