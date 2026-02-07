# 08. 设计思想总览：这篇博客背后的方法论，以及对 SanBot 的映射

## 1) 这篇博客真正讲的不是“功能清单”
表面在讲 SDK 能力，底层其实在讲一套 agent 设计哲学：

1. 给模型真实操作环境（computer + tools），而不是只让它“文字推理”。
2. 用闭环反馈（loop + verification）替代一次性回答。
3. 用上下文工程（context engineering）替代“无限上下文幻想”。
4. 用评测驱动（eval-driven）替代“靠直觉调 prompt”。

## 2) 四个第一性原理（First Principles）

### Principle 1: Simplicity First（先简单）
先用可解释、可控、可调试的方案（agentic search、少量高质量工具），再引入复杂能力（语义检索、多代理、高级评审）。

### Principle 2: Ground Truth Driven（环境真值驱动）
agent 的每一步都要被外部反馈校正，不能只依赖“语言上看起来对”。

### Principle 3: ACI Matters（Agent-Computer Interface 很重要）
工具定义不是细节，而是行为控制面。坏接口会直接造成坏策略。

### Principle 4: Evaluation is Product（评测是产品能力）
没有评测，任何“优化”都不可复现、不可迁移。

## 3) 把理念映射到 SanBot 三层架构

你的三层架构：基础设施层 -> 认知层 -> 自主层。

### 基础设施层（exec/session/tools）
- 对应博客中的“给 agent 一台电脑”。
- 重点：稳定命令执行、文件工具、权限边界、失败恢复。

### 认知层（memory/reasoning/context）
- 对应 Gather Context + Context Management。
- 重点：短期上下文治理、长期记忆沉淀、检索策略分层。

### 自主层（self-tooling/meta-cognition）
- 对应 Take Action 中的 code generation 与工具进化。
- 重点：发现能力缺口 -> 自动生成工具 -> 验证后纳入工具库。

## 4) SanBot 的阶段化实施建议

### Phase 1: Build the loop（先跑通闭环）
- 目标：`Gather -> Act -> Verify` 最小可用闭环。
- 指标：可稳定完成 MVP 场景（exec、创建工具、复用工具）。

### Phase 2: Strengthen context（强化上下文治理）
- 目标：引入压缩、子代理、记忆分层。
- 指标：长任务成功率与成本曲线改善。

### Phase 3: Expand ecosystem（扩展生态接入）
- 目标：MCP + 业务工具封装。
- 指标：新增集成接入时间显著下降。

### Phase 4: Evaluation-driven autonomy（评测驱动自治）
- 目标：把自工具生成和策略调整纳入评测回路。
- 指标：每轮迭代可量化收益，且对 holdout 任务有提升。

## 5) 决策准则：何时增加复杂度
你可以用一个简单判断：

`如果当前方案在目标指标上已稳定达标，不要引入新复杂度。`

只有当以下情况出现再升级：
- 成功率瓶颈
- 时延瓶颈
- 成本瓶颈
- 可维护性瓶颈

## 6) 易踩坑预警（针对 SanBot）
- 过早引入太多高级能力，导致核心 loop 不稳定。
- 忽略工具设计质量，导致模型频繁误用。
- 只追求“更自动”，忽略验证与审计。
- 没有基线评测，改进不可证明。

## 7) 一句话方法论
`先让 agent 稳定完成任务，再让它更聪明；先把反馈系统做扎实，再谈自主进化。`

## Checklist
- SanBot 当前是否已有可审计的三段式闭环？
- 自工具生成是否接入了验证与回归评测？
- 上下文与记忆是否有明确分层和生命周期策略？
- 新增复杂度是否对应明确瓶颈与量化目标？
