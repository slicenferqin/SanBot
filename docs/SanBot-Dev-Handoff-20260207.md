# SanBot 开发交接记录（2026-02-07，架构版）

## 0. 结论先行

当前 WebUI 主流程已经可用并完成核心功能闭环（事件时间线 / Context Drawer / 会话列表 / 会话级模型恢复），
但底层架构仍有 3 个里程碑必须推进，才能从“可用”进入“稳定可发布”。

- 已完成：功能链路与主要体验问题修复
- 待推进：并发安全、会话生命周期治理、协议幂等与回放一致性
- 决策保持：继续单 LLM，不引入多 Agent

---

## 1. 本次已交付（功能层）

### 1.1 WebUI 三步改造已落地
- 主时间线工具事件化：`tool_start` / `tool_end` / `turn_summary`
- Context 顶部入口 + 右侧抽屉，接入 `/api/context`
- 左侧最近 7 天会话列表 + 会话切换

### 1.2 关键回归问题已修复
- 切会话后 URL `sessionId`、WS 绑定、历史回填一致
- 流式中禁止切换会话；停止后可切换
- 修复 assistant 重复卡片 / 输出串位 / 刷新后事件回放表现不一致
- 桌面端切会话不再自动收起侧栏（移动端保持收起）

### 1.3 会话级模型能力完成
- `llm_update` 只更新当前 session 的 Agent
- session 级模型持久化：`~/.sanbot/memory/session-configs/<sessionId>.json`
- 服务重启后 session 重新绑定可恢复模型
- `/api/sessions` 已返回 `llm` 信息（providerId/model/temperature/updatedAt）
- 侧栏会话卡可显示模型徽章（provider/model 简写）

### 1.4 输入区体验升级
- Codex 风格大 composer（大圆角、多行、大字号）
- 内联模型/effort 控件，发送/停止圆按钮
- 第二轮细节：移动端触控尺寸、快捷键提示、状态信息降噪

---

## 2. 已推送提交

- 分支：`main`
- 关键提交：
  - `9d931c6` `feat(web): improve session UX and persist session-scoped llm config`
  - `fb68483` `docs: add 2026-02-07 handoff and next-step plan`
  - `4873089` `feat(web): add session model badges and polish composer UX`

---

## 3. 当前架构状态评估（重点）

### 3.1 已达成
- 会话级状态（history + model）已基本建立
- 前后端协议基础已统一，能够支持事件型时间线
- 主要体验型阻塞问题已清除

### 3.2 仍需完善（必须项）
1. 确认路由仍依赖全局态，存在并发串会话风险（P0）
2. `sessionPool` 缺少 TTL/LRU/上限治理，长期运行有内存增长风险（P0）
3. WS 协议缺少统一 envelope（版本/序号/幂等），重连边界不够稳（P1）
4. 存储写入需要更强原子性（tmp+rename）与损坏恢复策略（P1）
5. 历史回放仍有“从 toolCalls 重建事件”的兼容路径，非完整事件源（P1）

---

## 4. 主流程里程碑（必须推进）

## M4：RC 稳定化（P0）
目标：把“可用”升级为“可发布稳定”。

- 任务 A：确认机制去全局态
  - 改造点：`src/utils/confirmation.ts`
  - 方向：按 `connectionId/sessionId` 显式路由确认回调
- 任务 B：SessionPool 生命周期治理
  - 改造点：`src/web/server.ts`
  - 方向：`lastActiveAt` + TTL 回收 + 最大 session 数限制 + 回收日志
- 验收标准：
  - 多标签/多会话并发不串确认
  - 长时间运行 session 数增长可控

## M5：契约冻结 + 自动化回归（P1）
目标：防止后续迭代反复打破主流程。

- 任务 A：WS envelope 规范化（`v`/`seq`/`sessionId`/`messageId`）
- 任务 B：前端事件去重与幂等消费
- 任务 C：补充契约测试与边界测试
  - `/api/sessions` + `llm` 字段
  - session 模型恢复（provider 缺失回退）
- 验收标准：
  - 断线重连不重复渲染、不漏关键事件
  - 契约测试可覆盖高风险回归

## M6：运维与排障闭环（P1）
目标：线上问题可快速定位。

- 任务 A：统一关键日志字段（sessionId/messageId/toolId）
- 任务 B：健康检查与启动自检
- 任务 C：最小可用调试导出（最近会话/上下文/事件摘要）
- 验收标准：
  - 问题出现后 5 分钟内定位到层级（会话/模型/工具/传输）

---

## 5. 下一位接手者执行顺序（建议）

1. 先做 M4（确认路由 + SessionPool 回收），不要先开新功能。
2. 做 M5 的最小契约测试骨架，至少覆盖 `/api/sessions` 和模型恢复。
3. 完成一次完整 E2E 手测：
   - 切会话 -> 切模型 -> 刷新 -> 重启服务 -> 再切回验证。
4. 通过后再进入 M6（日志/健康检查/调试导出）。

---

## 6. 已有文档与定位入口

- 本交接文档：`docs/SanBot-Dev-Handoff-20260207.md`
- 协议文档：`docs/WebUI-API-Contracts-20260207.md`
- 上一版交接：`docs/SanBot-Dev-Handoff-20260206.md`

关键代码入口：
- `src/web/server.ts`
- `src/utils/confirmation.ts`
- `src/memory/storage.ts`
- `src/web/adapters.ts`
- `src/web/frontend/src/hooks/useWebSocket.ts`
- `src/web/frontend/src/stores/chat.ts`

---

## 7. 已跑校验（最近一次）

- `bun test tests/session-llm-config.test.ts tests/storage-session-digests.test.ts tests/redaction.test.ts`
- `bun -e "import './src/web/server.ts'"`
- `bun run --cwd src/web/frontend build`

---

## 8. 约束与产品决策（锁定）

- 架构：单 LLM（本轮不做多 Agent）
- 会话切换：流式中禁止切换，非流式立即切换，保留输入草稿
- 工具事件：默认轻量展示，详情折叠
- 安全展示：参数默认脱敏，不提供完整明文模式
