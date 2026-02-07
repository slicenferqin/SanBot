# SanBot 交互形态路线分析（2026-02-06）

## 背景与调研来源
- Claude Agent SDK 提倡的 Gather → Act → Verify 闭环，为 SanBot 的三层架构提供了明确的执行模板（docs/Claude-Agent-SDK-Blog-Digest.md:23-68）。
- WebUI 已完成 MVP，可承载信息架构、工具状态和危险命令可视化（docs/WebUI-Design-v2.md:1-205）。
- TUI 相关计划在 Phase1 完工后终止，当前交互主力转向 WebUI（docs/TUI-Phase1-Completion-Report.md、用户反馈）。
- 行业趋势参考：
  - Anthropic **Claude Cowork**：macOS 桌面应用，允许运行在隔离 VM 中读取本地文件、连接云端工具，但仍处研究预览阶段，安全与企业审计能力受限（https://claude.com/product/cowork）。
  - OpenAI **Codex App**：macOS（Apple Silicon）桌面端，主打多线程 agent、内置 Git/Worktree/Automations，与 CLI/IDE 共享技能（https://developers.openai.com/codex/app）。
  - OpenAI **Frontier**：强调“前线部署工程师”模式，将 agent 引入企业运营，凸显安全、权限与本地上下文的重要性（https://www.zdnet.com/article/openai-frontier-manage-enterprise-ai-agents-like-palantir/）。

## 交互方式评估

### WebUI
- **优势**：零安装、易分享，支持侧边栏/抽屉/多会话等复杂信息架构；能直观呈现工具调用、危险命令审计与记忆注入；复用现有 Web 安全体系。
- **局限**：对本地文件与操作系统 API 的控制有限，实时性取决于网络；需要额外的连接器才能访问私有资源。

### CLI / TUI
- **优势**：对工程师友好，可脚本化、资源占用低，易与审计/危险命令确认组合（docs/audit-command.md:17-77）。
- **局限**：已放弃 TUI 方向，且在非技术用户场景下可用性差，难以承载可视化需求。

### 原生客户端
- **优势**：如 Cowork、Codex 等可直接访问本地文件、终端和浏览器连接器，适合“给模型一台电脑”的高权限任务；支持离线缓存、系统托盘通知、持续后台任务。
- **局限**：需安装/授权，跨平台和企业治理成本高；目前市场主流产品仍限于 macOS，且安全审计尚未成熟。

## 为什么短期聚焦 WebUI
1. **现成能力**：SanBot WebUI 已具备基础交互和视觉体系，是唯一同时服务非技术和技术用户的渠道（docs/WebUI-Design-v2.md:35-205）。
2. **风险可控**：相比直接提供高权限客户端，WebUI 可以在浏览器沙箱内逐步验证危险命令拦截、审计日志和工具权限模型。
3. **支撑 Gather 阶段**：可成为 agentic search 的主要入口，集中管理目录浏览、记忆注入、工具状态，继而把同样的 Loop 投射到客户端。
4. **为客户端铺路**：WebUI 的行为日志与痛点可反哺桌面客户端设计，明确哪些功能真正需要本地权限，避免多线作战。

## SanBot 的使命与路线重构
- **使命**：把 Claude Agent SDK 的“给模型一台电脑”理念落地到本地工作站，结合 SanBot 的三层哲学（基础设施 / 认知 / 自主）构建“自治运营层”。
- **路线**：
  1. **基础设施层**：完善 WebUI、exec 工具、危险命令确认与审计链路（docs/audit-command.md:17-101）。
  2. **认知层**：采用 agentic search → 语义检索的渐进策略，引入子代理、记忆 compact、动态上下文注入（docs/Claude-Agent-SDK-Blog-Digest.md:23-44）。
  3. **自主层**：建立 Self-Tooling 工作流（需求检测→工具生成→自测→注册→复用），并加入执行质量评审，形成失败样例驱动的自我改进（docs/Sanbot-Architecture-Design.md:983-1050）。

## 应用场景定位
1. **知识密集交付**：在 WebUI 内聚合文件/记忆，驱动工具执行与 Verify 分层评审，产出结构化报告。
2. **本地自动化/运维**：先在 WebUI 定义操作策略与审计规则，再通过未来的客户端或连接器扩展到本地脚本、部署、回归任务。
3. **自助自演进平台**：利用 Self-Tooling 将使用中暴露的缺口转化为可复用脚本，类似 Codex/Cowork 的技能库但更注重本地安全。
4. **策略与合规代理**：通过多层权限、审计与验证机制，为企业场景提供“透明、自控”的 agent 执行记录，缓解外部 SaaS 被 agent 替换带来的治理焦虑。

## 下一步行动建议
1. **继续迭代 WebUI**：完善工具调度、危险提示、记忆注入、审计视图，确保 Gather → Act → Verify 闭环在 Web 端可用。
2. **梳理 Self-Tooling 流程**：定义从缺口检测到工具上架的标准作业，补充自测与质量反馈机制。
3. **设计记忆与搜索策略文档**：在 docs 中形成 agentic search、compact、子代理协作的工作手册，指导后续实现。
4. **评估客户端路线**：基于 WebUI 使用数据，规划何时引入本地连接器 / 桌面壳，参考 Cowork/Codex 的权限隔离、技能/自动化模型。
