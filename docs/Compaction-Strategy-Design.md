# SanBot Compaction 策略设计

> 状态：草案 v1 | 日期：2026-02-06

## 一、设计目标

1. **延长有效运行时间**：避免上下文溢出导致任务中断
2. **保持推理连续性**：压缩后 Agent 仍能理解任务进展
3. **沉淀有价值信息**：重要决策和事实不因压缩丢失
4. **可审计可回滚**：压缩操作有记录，必要时可恢复

## 二、分层架构

```
┌─────────────────────────────────────────────────────────┐
│  Context Window（上下文窗口）                            │
│  - 当前会话的对话历史                                    │
│  - 实时工具调用结果                                      │
│  - 短期摘要（shortTermSummary）                          │
├─────────────────────────────────────────────────────────┤
│  Session Memory（会话记忆）                              │
│  - session-summaries/{sessionId}.md                     │
│  - 本次会话的压缩产物                                    │
├─────────────────────────────────────────────────────────┤
│  Extracted Memory（抽取记忆 - L1）                       │
│  - extracted/runtime.md（运行时上下文）                  │
│  - extracted/preferences.md                             │
│  - extracted/facts.md                                   │
│  - extracted/decisions.md                               │
├─────────────────────────────────────────────────────────┤
│  Master Summary（主摘要 - L2）                           │
│  - summary/master.md                                    │
│  - 跨会话的用户画像和关键信息                            │
└─────────────────────────────────────────────────────────┘
```

## 三、触发策略

### 3.1 自动触发条件

| 触发器 | 阈值 | 说明 |
|--------|------|------|
| 消息数量 | > 80 条 | 预留 20 条缓冲，避免临界溢出 |
| Token 估算 | > 80% 窗口 | 按模型窗口大小动态计算 |
| 工具输出累积 | > 50KB | 大量工具输出时主动清理 |

### 3.2 触发时机

```
用户消息 → 检查触发条件 → [触发] → 执行 Compaction → 继续处理
                        → [未触发] → 直接处理
```

### 3.3 配置项

```typescript
interface CompactionConfig {
  // 触发阈值
  maxMessages: number;        // 默认 80
  maxTokenRatio: number;      // 默认 0.8
  maxToolOutputBytes: number; // 默认 50 * 1024

  // 保留策略
  keepRecentMessages: number; // 默认 20
  keepSystemPrompt: boolean;  // 默认 true

  // 摘要策略
  useLLMSummary: boolean;     // 默认 true
  summaryMaxTokens: number;   // 默认 500
}
```

## 四、压缩流程

### 4.1 流程图

```
┌─────────────────┐
│ 检测到触发条件   │
└────────┬────────┘
         ▼
┌─────────────────┐
│ 1. 快照当前历史  │  → 写入 session-summaries/{sessionId}-{timestamp}.jsonl
└────────┬────────┘
         ▼
┌─────────────────┐
│ 2. 分离保留区    │  → 最近 N 条消息 + 系统提示
└────────┬────────┘
         ▼
┌─────────────────┐
│ 3. 生成摘要      │  → LLM 摘要 或 规则摘要
└────────┬────────┘
         ▼
┌─────────────────┐
│ 4. 抽取关键信息  │  → 决策、事实、偏好 → L1
└────────┬────────┘
         ▼
┌─────────────────┐
│ 5. 重建上下文    │  → 系统提示 + 摘要 + 保留消息
└────────┬────────┘
         ▼
┌─────────────────┐
│ 6. 记录审计日志  │  → context/events.jsonl
└─────────────────┘
```

### 4.2 摘要生成策略

#### 策略 A：LLM 摘要（推荐）

```typescript
const summaryPrompt = `
请将以下对话历史压缩为简洁摘要，保留：
1. 用户的核心意图和目标
2. 已完成的关键步骤
3. 重要的决策和结论
4. 待处理的事项

对话历史：
${conversationText}

输出格式：
## 任务目标
[一句话描述]

## 已完成
- [步骤1]
- [步骤2]

## 关键决策
- [决策1]

## 待处理
- [事项1]
`;
```

#### 策略 B：规则摘要（低成本备选）

```typescript
function createRuleSummary(messages: Message[]): string {
  const userMessages = messages.filter(m => m.role === 'user');
  const toolCalls = extractToolCalls(messages);

  return `
## 会话摘要
- 用户消息数：${userMessages.length}
- 工具调用数：${toolCalls.length}
- 最近话题：${userMessages.slice(-3).map(m => m.content.slice(0, 50)).join('; ')}
- 工具使用：${[...new Set(toolCalls.map(t => t.name))].join(', ')}
`;
}
```

### 4.3 关键信息抽取

压缩时同步抽取以下信息到 L1：

| 类型 | 目标文件 | 抽取规则 |
|------|----------|----------|
| 决策 | decisions.md | 包含"决定"、"选择"、"确定"的语句 |
| 事实 | facts.md | 包含项目名、路径、配置的语句 |
| 偏好 | preferences.md | 包含"喜欢"、"偏好"、"习惯"的语句 |
| 运行时 | runtime.md | 工具调用摘要、错误信息 |

## 五、回滚机制

### 5.1 快照存储

每次压缩前保存完整快照：

```
~/.sanbot/memory/session-summaries/
├── {sessionId}-{timestamp}.jsonl    # 原始消息
├── {sessionId}-{timestamp}.meta.json # 元信息
└── {sessionId}.md                    # 累积摘要
```

### 5.2 回滚命令

```bash
# 查看可回滚的快照
sanbot history --session {sessionId}

# 回滚到指定快照
sanbot rollback --snapshot {sessionId}-{timestamp}
```

### 5.3 自动清理

- 保留最近 7 天的快照
- 超过 7 天的快照自动删除
- 但 L1/L2 记忆永久保留

## 六、与 Memory 的协同

### 6.1 实时沉淀

```
Compaction 触发
    │
    ├─→ shortTermSummary（注入系统提示）
    │
    ├─→ session-summaries/{sessionId}.md（会话级持久化）
    │
    └─→ extracted/runtime.md（L1 持久化）
```

### 6.2 定期整理

```
每日 consolidate（手动或定时）
    │
    ├─→ L0 daily logs → L1 extracted memories
    │
    └─→ L1 extracted → L2 master summary
```

### 6.3 上下文注入顺序

```typescript
function getSystemPrompt(): string {
  return [
    basePrompt,           // 基础身份和能力
    soulContext,          // 灵魂记录（L2）
    memoryContext,        // 用户记忆（L2）
    runtimeContext,       // 项目上下文
    shortTermSummary,     // 本次会话摘要（压缩产物）
  ].filter(Boolean).join('\n');
}
```

## 七、验收指标

| 指标 | 目标 | 测量方法 |
|------|------|----------|
| 上下文溢出率 | < 5% | 统计因溢出中断的会话比例 |
| 摘要保真度 | > 80% | 人工评估摘要是否保留关键信息 |
| 压缩后任务成功率 | 无显著下降 | 对比压缩前后的任务完成率 |
| 回滚成功率 | 100% | 测试回滚功能是否正常 |

## 八、实施计划

### Phase 1：基础压缩（当前迭代）

- [x] 消息数量触发
- [x] 简单拼接摘要
- [x] 写入 session-summaries
- [ ] 写入 extracted/runtime.md

### Phase 2：智能摘要

- [ ] LLM 摘要生成
- [ ] 关键信息自动抽取
- [ ] Token 估算触发

### Phase 3：完整闭环

- [ ] 回滚命令实现
- [ ] 自动清理策略
- [ ] 审计日志完善
- [ ] 验收指标监控

## 九、配置示例

```json
// ~/.sanbot/config.json
{
  "compaction": {
    "enabled": true,
    "maxMessages": 80,
    "maxTokenRatio": 0.8,
    "keepRecentMessages": 20,
    "useLLMSummary": true,
    "summaryMaxTokens": 500,
    "snapshotRetentionDays": 7
  }
}
```

## 十、参考

- [05-subagents-and-context-management.md](./Claude-Agent-SDK-Deep-Dive-Series/05-subagents-and-context-management.md)
- [08-design-philosophy-and-sanbot-mapping.md](./Claude-Agent-SDK-Deep-Dive-Series/08-design-philosophy-and-sanbot-mapping.md)
- [SanBot-Dev-Handoff-20260206.md](./SanBot-Dev-Handoff-20260206.md)
