# 01. Agent Loop：从“会回答”到“会完成任务”的思维框架

## 1) 什么是 Agent Loop（代理闭环）？
`Agent Loop（代理闭环）` 是一种反复迭代的执行结构：

`Gather Context（收集上下文） -> Take Action（执行动作） -> Verify Work（验证结果） -> Repeat（继续迭代）`

它不是一个“流程图装饰”，而是把模型从“单次回答器（single-shot responder）”变成“可持续完成任务的执行系统（execution system）”。

## 2) 为什么 Agent Loop 是核心，而不是可选项？
- 开放式任务（open-ended tasks）天然不确定：你在开始时通常不知道需要几步、会遇到什么异常。
- 真实世界任务必须依赖 `ground truth（环境真实反馈）`：测试结果、命令输出、API 返回、文件变化。
- 没有验证环节的 agent 容易“自信地错”：看起来合理，但没有被环境约束。

一句话：Loop 的价值是让 agent 用环境反馈约束推理，而不是只靠语言流畅性。

## 3) Agent vs Workflow：概念边界
在 Anthropic 的工程语境里：
- `Workflow（工作流）`：预先写好的固定路径，确定性更强。
- `Agent（代理）`：由模型动态决定下一步动作，灵活性更强。

实践上通常是混合形态：
- 外层是 workflow（例如审批、审计、配额控制）。
- 内层是 agent loop（例如故障定位、代码修复、研究综合）。

## 4) Loop 的“状态机”视角（State Machine）
把 Agent Loop 看成状态机会更实用：

- `S1: Need Context`：信息不足，先找信息。
- `S2: Can Act`：信息足够，执行动作。
- `S3: Need Verify`：动作后必须校验。
- `S4: Done / Escalate`：完成或升级给人类。

状态切换靠“证据”而不是“感觉”：
- 测试通过/失败
- 输出是否符合规则
- 是否命中停止条件（stop condition）

## 5) 设计 Agent Loop 的关键逻辑

### A. 先定义停止条件（Stop Conditions）
典型停止条件：
- 所有硬性规则通过（lint/test/schema/business rules）。
- 达到最大迭代次数（防止无限循环）。
- 风险动作需要人工确认（human-in-the-loop）。

### B. 让每次迭代都“可解释”
每轮至少留下三类记录：
- 做了什么（action）
- 为什么做（reason）
- 结果如何（result）

### C. 让错误可恢复（Recoverable）
不要把 loop 设计成“一次失败全盘重来”；要允许局部回退和分支重试。

## 6) 常见误区
- 把 agent 当“超级 prompt”而非“执行系统”。
- 没有验证层，只要模型说“完成”就结束。
- 没有成本上限，导致长回路在低价值任务上过度消耗。
- 把所有能力塞给一个 agent，不做任务分解。

## 7) 一个最小可用模板（MVP Loop）
```text
while not done:
  context = gather(task, history, environment)
  action = decide(context)
  result = execute(action)
  verdict = verify(result, rules)
  if verdict.pass: done = maybe_done(task, criteria)
  else: refine(task, verdict.feedback)
```

## 8) 你应该带走的结论
- Agent Loop 本质上是“反馈控制系统（feedback control system）”，不是聊天技巧。
- 可靠 agent 的关键不在“模型多聪明”，而在“反馈多扎实”。
- 任何能规模化落地的 agent，都必须把 `Gather / Act / Verify` 做成工程结构，而不是写在文档里的口号。

## Checklist
- 是否定义了清晰的停止条件和迭代上限？
- 每次迭代是否有可审计的证据链？
- 验证失败后是否有明确重试/回退策略？
- 是否区分了“探索阶段”和“执行阶段”？
