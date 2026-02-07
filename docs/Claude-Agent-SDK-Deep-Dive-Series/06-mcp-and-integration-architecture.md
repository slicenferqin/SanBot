# 06. MCP（Model Context Protocol）：从“点对点集成”到“标准化能力总线”

## 1) MCP 是什么
`MCP（Model Context Protocol，模型上下文协议）` 是一个开放标准，用于把 AI 应用/agent 与外部数据源、工具、服务连接起来。

官方常用比喻是：
`MCP is like USB-C for AI`。

含义是：
- 统一连接方式
- 减少重复接线
- 让生态可组合

## 2) MCP 解决的核心问题
传统做法是“每个工具写一套专用集成”。
问题：
- 成本高
- 难维护
- 扩展慢

MCP 的价值在于把“集成成本”从 N 对 N 降到标准接口层。

## 3) MCP 的基本架构
- `MCP Server`：暴露工具、资源、提示模板。
- `MCP Client`：让 agent 发现并调用这些能力。
- `Tools`：可执行动作（如查询、写入、调用 API）。
- `Resources`：可读取资源（文档、数据对象）。
- `Prompts`：可复用提示入口（命令式模板）。

协议层面核心动作：
- `tools/list`：发现可用工具
- `tools/call`：执行工具调用

## 4) 对 agent 设计的真正意义

### 能力即插即用（capability plug-in）
接入新系统不必重写 agent 主流程。

### 生态复用（ecosystem leverage）
可以直接使用已有 MCP servers，而非从零造轮子。

### 统一治理（governance）
权限、审计、输出限制等策略可统一施加在 MCP 接入层。

## 5) 传输、认证与部署形态
在 Claude Code 生态里常见三种：
- HTTP（推荐）
- SSE（逐步被 HTTP 替代）
- Stdio（本地进程）

企业场景还涉及：
- OAuth 认证流程
- 项目级/用户级配置范围（scope）
- 托管策略（managed configuration）

## 6) 安全边界：MCP 最容易被低估的部分
MCP 带来能力扩展，也带来风险扩展。

关键风险：
- Prompt injection（提示注入）
- 越权调用（over-privileged tool use）
- 数据外泄（sensitive data exfiltration）

应对原则：
1. `Least Privilege（最小权限）`
2. `Human Confirmation（关键动作人工确认）`
3. `Auditability（全程可审计）`
4. `Output Guardrails（输出大小与结构约束）`

## 7) 如何选 MCP server（实战决策）
可用四维评估：
- `Capability fit`：是否真覆盖你的主任务路径。
- `Operational trust`：维护主体、更新频率、社区活跃度。
- `Security posture`：认证、权限、可追踪性。
- `Token efficiency`：工具描述与返回是否省上下文。

## 8) MCP 与自定义工具的关系
不是替代关系，而是分工关系：
- MCP：外部系统连接标准化。
- Custom Tools：你的业务动作封装与语义层抽象。

最佳实践通常是：
`MCP 提供底层连接 + 自定义工具提供业务语义入口`。

## 9) 你应该带走的结论
- MCP 的本质价值不是“多接一个工具”，而是“让 agent 架构从一次性集成走向平台化扩展”。
- 在生产环境，MCP 的治理与安全设计和能力设计同等重要。
- 最好的接入方式是“标准协议 + 业务封装”双层结构。

## Checklist
- 当前集成是否存在重复建设，适合用 MCP 标准化吗？
- 是否建立了 MCP server 的安全准入标准？
- 是否对高风险工具调用设定人工确认？
- MCP 返回内容是否做了 token 与结构约束？
