# Claude Agent SDK 深度学习系列（中文主讲 + 关键英文术语）

> 目标：围绕博客《Building agents with the Claude Agent SDK》做“概念拆解 + 方法论还原 + 设计思维迁移”。
>
> 阅读对象：希望系统掌握 agent 设计的人（不只会“调用模型”，而是会“设计可运行的 agent 系统”）。

## 学习路线（推荐顺序）
1. `01-agent-loop-thinking-framework.md`：先建立 Agent Loop 心智模型。
2. `02-gather-context-context-engineering.md`：理解为什么上下文工程（Context Engineering）是核心。
3. `03-take-action-tooling-and-execution.md`：理解 agent 如何真正“做事”。
4. `04-verify-work-feedback-and-reliability.md`：理解 agent 为什么能变可靠。
5. `05-subagents-and-context-management.md`：掌握长任务下的扩展与上下文治理。
6. `06-mcp-and-integration-architecture.md`：理解 MCP 的架构价值与边界。
7. `07-testing-evals-and-iteration.md`：建立评测驱动（Evaluation-Driven）迭代方法。
8. `08-design-philosophy-and-sanbot-mapping.md`：把理念映射到 SanBot 的落地路线。
9. `09-sanbot-execution-roadmap.md`：SanBot 实施蓝图（里程碑 + 验收指标 + 风险控制）。

## 如何使用这套文档
- 每篇都按 `What（是什么）/ Why（为什么）/ How（怎么做）/ Pitfalls（常见坑）` 组织。
- 术语首次出现会给出中文翻译与语义解释，比如：`Agentic Search（代理式检索）`。
- 每篇末尾有“可执行清单（Checklist）”，可以直接拿去做设计评审。

## 资料来源与说明
- 核心来源：
  - Building agents with the Claude Agent SDK（Anthropic, 2025-09-29）
  - Building effective agents（Anthropic Engineering, 2024-12-19）
  - Writing effective tools for agents — with agents（Anthropic Engineering, 2025-09-11）
  - Contextual Retrieval（Anthropic, 2024-09-19）
  - Introducing the Model Context Protocol（Anthropic, 2024-11-25）
  - Claude Code docs（how it works / subagents / mcp / costs / headless）
  - MCP specification（tools, protocol revision 2025-06-18）
- 说明：个别 Agent SDK API 细节在公开网页抓取中受区域限制，本系列对这些部分使用了“官方博客 + Claude Code 文档 + MCP 规范”的交叉解释法，重点聚焦设计思想与可迁移方法，而非某个 SDK 版本的细枝末节。
