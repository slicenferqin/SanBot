# 02. Gather Context：上下文工程（Context Engineering）才是 agent 的第一生产力

## 1) Gather Context 不是“多塞信息”
`Gather Context（收集上下文）` 的本质是：

让 agent 在“有限上下文窗口（context window）”内，拿到“对当前决策最有用的信息”。

不是信息越多越好，而是相关性（relevance）和时效性（freshness）更关键。

## 2) 文件系统为什么是上下文工程的一部分？
博客强调了一个很重要的观点：

`File system as potential context（文件系统即潜在上下文池）`

这意味着目录结构本身就是检索策略。
- 好的目录命名让 agent 更容易定位信息。
- 清晰的分层减少无效读取。
- 标准化日志和报告目录能让 agent 快速聚焦。

换句话说，信息架构（information architecture）就是 agent 的“外部记忆秩序”。

## 3) Agentic Search vs Semantic Search

### Agentic Search（代理式检索）
- 通过命令行工具与脚本逐步缩小范围（例如 grep/tail 类能力）。
- 优点：透明、可审计、易调试。
- 缺点：在超大语料和高召回场景下可能慢。

### Semantic Search（语义检索）
- 通过向量检索按语义匹配候选内容。
- 优点：速度快、语义召回强。
- 缺点：构建维护复杂、解释性弱、索引质量强依赖工程细节。

官方建议背后的逻辑是：
- 先用 agentic search 打基础（低复杂度、高透明度）。
- 性能瓶颈出现后再引入 semantic search（增量升级）。

## 4) 从 RAG 到 Contextual Retrieval 的启发
传统 RAG 常见问题是 `context stripped chunks（被剥离语境的文本块）`，召回到的片段缺少上下文。

`Contextual Retrieval（上下文化检索）` 的关键思想：
- 在切块前后补充“块级语境说明（chunk-specific context）”。
- 结合语义检索与 BM25（关键词匹配）提升召回准确率。

对于 agent 设计的启发：
- 检索质量不只是“向量模型质量”，还取决于“你给片段保留了多少可解释语境”。

## 5) Subagents 在 Gather 阶段的价值
`Subagents（子代理）` 在收集上下文时有两个核心价值：
- 并行化（parallelization）：多个子代理同时探索不同信息源。
- 上下文隔离（context isolation）：主代理只接收摘要，避免主上下文膨胀。

这本质上是在做 `Map-Reduce`：
- Map：子代理各自检索与分析。
- Reduce：主代理融合关键结果。

## 6) 长任务中的 Context Compaction（上下文压缩）
长会话一定会遇到上下文衰减。

`Compaction（压缩）` 的价值是：
- 丢弃低价值历史（如陈旧工具输出）。
- 保留关键决策轨迹与约束。

你要有一个默认原则：
- 规则与约束放在持久位置（如 CLAUDE.md / memory files），不要只依赖会话早期消息。

## 7) Gather Context 的工程策略

### A. 信息分层（Hot / Warm / Cold）
- Hot：当前任务必要信息（必须进上下文）。
- Warm：可能相关（按需加载）。
- Cold：历史归档（仅检索时触达）。

### B. 先窄后宽（Narrow to Broad）
先基于结构和关键词做窄检索，再做语义扩展，避免大范围盲扫。

### C. 先证据后推理
先把证据片段拉齐，再让模型做综合判断，减少“先入为主”的幻觉。

## 8) 常见误区
- 一上来全量向量化，忽略文件结构优化。
- 检索层没有可观察性，不知道“为什么召回这段”。
- 过度依赖一次检索，不做二次验证与交叉证据。

## 9) 你应该带走的结论
- Gather Context 是 agent 可靠性的上游变量。
- 上下文工程不是“模型前置步骤”，而是持续运行时能力。
- 最好的检索方案往往是“透明检索 + 语义检索”组合，而不是二选一。

## Checklist
- 是否给信息源设计了清晰目录和命名规范？
- 是否先做 agentic search，再按需引入 semantic search？
- 是否有上下文压缩与持久记忆策略？
- 子代理返回的是摘要结果而非整段噪音吗？
