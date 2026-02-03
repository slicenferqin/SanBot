# TUI 重构计划

## 目标

提升 SanBot 的用户体验，从"能用"到"好用"。

---

## 当前问题

1. **等待焦虑**: LLM 响应需要等待全部完成才显示，用户不知道在干嘛
2. **信息混乱**: 工具调用、结果、错误信息混在一起，难以区分
3. **视觉单调**: 纯文本输出，缺乏层次感
4. **反馈不足**: 长时间操作没有进度提示

---

## Feature 列表

### Feature 1: 流式输出 (Streaming)

**优先级**: P0 (最高)

**需求**:
- LLM 响应实时逐字显示，而不是等全部完成
- 用户能看到 AI 的"思考过程"
- 支持 Anthropic 和 OpenAI 兼容 API 的流式响应

**技术要点**:
- Anthropic SDK: 使用 `client.messages.stream()`
- AI SDK: 使用 `streamText()` 替代 `generateText()`
- 处理流式响应中的 tool_use 事件

**验收标准**:
- [ ] 文本响应实时显示
- [ ] 工具调用时暂停流式，显示工具状态
- [ ] 工具完成后继续流式显示后续内容

---

### Feature 2: 工具调用状态显示

**优先级**: P0

**需求**:
- 工具调用时显示 spinner 动画
- 显示当前正在调用的工具名称和参数摘要
- 工具完成后显示结果状态（成功/失败）

**期望效果**:
```
⠋ Calling exec: ls -la /Users/...
✓ exec completed (0.3s)

⠋ Calling read_file: package.json
✓ read_file completed (0.1s)
```

**技术要点**:
- 使用 ANSI 转义码实现 spinner
- 或使用 `ora` / `nanospinner` 库
- 工具执行时间计时

**验收标准**:
- [ ] 工具调用时显示动态 spinner
- [ ] 显示工具名称和关键参数
- [ ] 完成后显示耗时和状态

---

### Feature 3: 彩色输出系统

**优先级**: P1

**需求**:
- 不同类型信息用不同颜色区分
- 支持终端颜色检测（无颜色终端降级）

**颜色方案**:
```
用户输入:     青色 (cyan)
AI 响应:      默认色 (white)
工具调用:     黄色 (yellow)
成功信息:     绿色 (green)
错误信息:     红色 (red)
警告信息:     橙色 (yellow)
系统提示:     灰色 (dim)
代码块:       带背景色
```

**技术要点**:
- 使用 ANSI 转义码或 `chalk` / `picocolors` 库
- 检测 `NO_COLOR` 环境变量和 TTY

**验收标准**:
- [ ] 不同信息类型颜色区分明显
- [ ] 非 TTY 环境自动禁用颜色
- [ ] 支持 `NO_COLOR` 环境变量

---

### Feature 4: 输出格式化

**优先级**: P1

**需求**:
- Markdown 渲染（代码块高亮、列表、标题）
- 长输出自动分页或折叠
- 代码块语法高亮

**期望效果**:
```
AI: 这是一个 TypeScript 示例：

  ┌─ typescript ─────────────────────────┐
  │ function hello(name: string) {       │
  │   console.log(`Hello, ${name}!`);    │
  │ }                                    │
  └──────────────────────────────────────┘

文件已保存到 `src/hello.ts`
```

**技术要点**:
- 使用 `marked` 解析 Markdown
- 使用 `cli-highlight` 或 `prism` 做语法高亮
- 或使用 `marked-terminal` 一体化方案

**验收标准**:
- [ ] 代码块有语法高亮
- [ ] 列表、标题正确渲染
- [ ] 内联代码有区分样式

---

### Feature 5: 进度条和统计

**优先级**: P2

**需求**:
- 长时间操作显示进度条
- 会话结束显示统计信息

**期望效果**:
```
📊 Session Stats:
   Duration: 2m 34s
   Tool calls: 5
   Tokens: ~1,200 in / ~800 out
```

**技术要点**:
- 工具调用计数
- Token 估算（或从 API 响应获取）
- 会话计时

**验收标准**:
- [ ] 显示会话时长
- [ ] 显示工具调用次数
- [ ] 显示 token 使用量（如果 API 返回）

---

### Feature 6: 交互增强

**优先级**: P2

**需求**:
- 多行输入支持（Shift+Enter 或 `\` 续行）
- 输入历史（上下箭头）
- 更好的提示符

**期望效果**:
```
┌─ SanBot ──────────────────────────────┐
│ 🤖 Ready                              │
└───────────────────────────────────────┘

❯
```

**技术要点**:
- 使用 `readline` 的 history 功能
- 或使用 `inquirer` / `prompts` 库
- 检测多行输入模式

**验收标准**:
- [ ] 支持上下箭头浏览历史
- [ ] 支持多行输入
- [ ] 提示符美观

---

### Feature 7: 错误处理美化

**优先级**: P1

**需求**:
- 错误信息友好化，不显示原始堆栈
- 提供可能的解决建议
- 区分用户错误和系统错误

**期望效果**:
```
❌ API Error: Rate limit exceeded

   Possible solutions:
   • Wait a moment and try again
   • Check your API quota at dashboard
   • Switch to a different provider

   Details: 429 Too Many Requests
```

**技术要点**:
- 错误分类和映射
- 常见错误的解决建议库

**验收标准**:
- [ ] 错误信息人类可读
- [ ] 提供解决建议
- [ ] 可选显示详细信息

---

## 实施建议

### 阶段一: 核心体验 (P0)
1. 流式输出
2. 工具调用状态显示

### 阶段二: 视觉优化 (P1)
3. 彩色输出系统
4. 输出格式化
5. 错误处理美化

### 阶段三: 交互增强 (P2)
6. 进度条和统计
7. 交互增强

---

## 技术选型建议

| 功能 | 推荐方案 | 备选 |
|------|---------|------|
| 流式输出 | Anthropic SDK stream / AI SDK streamText | - |
| Spinner | `nanospinner` (轻量) | `ora` |
| 颜色 | `picocolors` (轻量) | `chalk` |
| Markdown | `marked-terminal` | `marked` + `cli-highlight` |
| 交互 | 原生 `readline` | `inquirer` |

**原则**: 优先使用轻量级库，保持依赖简洁。

---

## 文件结构建议

```
src/
├── tui/
│   ├── index.ts        # TUI 主模块导出
│   ├── stream.ts       # 流式输出处理
│   ├── spinner.ts      # Spinner 组件
│   ├── colors.ts       # 颜色系统
│   ├── format.ts       # 输出格式化
│   └── prompt.ts       # 交互式提示
├── agent.ts            # 修改为支持流式
└── index.ts            # CLI 入口
```

---

## 注意事项

1. **向后兼容**: 保持现有 API 不变，TUI 改进是增量的
2. **降级处理**: 非 TTY 环境（如管道）自动禁用动画和颜色
3. **性能**: 流式输出不应增加明显延迟
4. **测试**: 确保在不同终端（iTerm2, Terminal.app, VS Code）下表现一致
