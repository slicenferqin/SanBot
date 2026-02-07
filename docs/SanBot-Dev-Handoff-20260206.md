# SanBot 开发交接记录（2026-02-06）

## 今日完成
- **上下文工程**：
  - 新增 `context/tracker.ts`，所有 `exec`（含 grep/rg 检测）、`read_file`、`list_dir` 行为都会写入 `~/.sanbot/context/events.jsonl`，WebUI “上下文事件” Tab 可追踪 agentic search 轨迹。
  - 在 `Agent` 的对话裁剪逻辑中，截断的历史会写入 `session-summaries/` 及 `extracted/runtime.md`（L1），并同步注入系统提示/前端，保证 compaction 产物跨会话可复用。
- **WebUI 视觉与交互**：
  - 引入玻璃拟态主题、Space Grotesk/Spline Sans 字体、径向背景；上下文面板改为 Tab + Focus 模式（桌面聚焦、移动端弹层），支持刷新/复制/快捷键。
  - 工具抽屉卡片升级：健康状态徽章、成功率进度条、日志折叠区统一风格。
  - 新增顶部“上下文”按钮与输入区模型面板（服务商/模型/强度滑杆），可即时调用后台 API 切换配置。
- **模型/服务商管理**：
  - `config.types`/`loader` 支持 `temperature` 字段，`updateActiveProvider` 可同时保存温度；`Agent` 在所有模型调用（Anthropic/OpenAI）中读取温度控制；WebSocket 消息携带温度，前端可显示并调节。
- **端口启动修复**：`sanbot web [port]` 与 `sanbot web --port [port]` 现能正确传递端口；当前服务器以 `nohup` 在 3120 端口运行（PID 6077，日志 `/tmp/sanbot-web.log`）。
 **上下文链路**：
  - 将 `glob/grep` 抽象为专用工具（结构化输出 + 行号），并在 WebUI 的事件卡片中突出“搜索 → 证据”流程。
  - 每次 compaction 后触发 MemoryConsolidator，将 `runtime` 归档到 L1/L2（可合并至 master summary），并提供“最近摘要 diff” 以便回归。
  - 设计 Gather → Act → Verify 的可视化看板（统计上下文命中率、工具调用成功率、审计导出状态）。

**模型面板**：
  - 目前只有单 agent，下一步可借鉴 opencode：`config.json` 中加入 `agents[]`，每个 agent 绑定提示词/权限；可在输入区的模型面板里切换 agent，或在设置抽屉里管理自定义模型。
  - 支持“新增模型”与“收藏模型”：在 `providers` 节点保存自定义模型清单，并允许用户写入 API Key/headers。

**评测闭环**：
  - 对 `run_tool` / 自定义工具建立回归测试入口（例如 `~/.sanbot/tools/<name>/tests`），在 WebUI 中展示健康趋势图。
  - 审计导出可直接生成 Verify 报告（JSON Schema + CSV + LLM 评语），并提供下载/分享入口。

**移动端体验**：
  - Focus 模式已支持移动端弹层，但后续需要针对 `BottomNav` 加入 Tab（对话/上下文/工具），并优化软键盘占位与输入区自适应。

**配置管理**：
  - 长期目标是对标 `~/.config/opencode/opencode.json`，即 `providers` + `agents` + `models` 的统一管理；兼容旧版 `~/.sanbot/config.json`，提供迁移脚本与 UI 提示。

## 开放问题
1. 是否需要为不同任务提供独立 Agent（例如 Build/Plan）？如果引入，权限隔离与工具白名单如何落地？
2. 上下文事件目前只记录本地工具调用，后续若扩展到 MCP/外部 API，是否需要统一的事件 Schema 与权限审计？
3. WebUI 的模型面板是否要支持“多模型并行对比”或“强度预设”？（例如 quick/draft vs. thorough）
4. compaction 写回 L1 的策略（触发频率、大小、回滚机制）尚未定稿，需要结合 MemoryConsolidator 的自动化计划一起讨论。
5. 是否需要提供 CLI/REST API，用于外部脚本远程切换模型/服务商，以便 DevOps 集成？

如需复盘日志，可查 `/tmp/sanbot-web.log` 或 `~/.sanbot/context/events.jsonl`。欢迎 Claude Code 接手后继续推进“上下文治理 + 模型配置 + 评测闭环”的路线。
