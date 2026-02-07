/**
 * SanBot WebUI Server
 * 使用 Bun 内置 HTTP server + WebSocket
 */

import type { ServerWebSocket } from 'bun';
import { Agent } from '../agent.ts';
import { getAvailableProviders, getProviderModels, loadConfig, updateActiveProvider } from '../config/loader.ts';
import type { Config } from '../config/types.ts';
import { setInteractiveMode, setTuiMode, setWebSocketConfirmCallback, removeWebSocketConfirmCallback, setActiveSessionId, clearActiveSessionId, type DangerAnalysis } from '../utils/confirmation.ts';
import { getAuditStats, getTodayAuditLogs, type AuditEntry } from '../utils/audit-log.ts';
import { loadToolRegistry, getToolLogs, getToolMeta, createDynamicToolDef } from '../tools/tool-registry-center.ts';
import { getSessionContext, formatMemoryContext } from '../memory/retrieval.ts';
import { loadSessionConversations } from '../memory/storage.ts';
import { runToolTool } from '../tools/self-tool.ts';
import { WebStreamWriter, WebToolSpinner, type WebSocketMessage } from './adapters.ts';
import { join } from 'path';
import { getRecentContextEvents } from '../context/tracker.ts';

/**
 * 客户端消息类型
 */
type ClientMessage =
  | { type: 'chat'; content: string }
  | { type: 'command'; command: string }
  | { type: 'confirm_response'; confirmed: boolean; confirmId: string }
  | { type: 'stop_request'; messageId: string }
  | { type: 'llm_get_providers' }
  | { type: 'llm_get_models'; providerId: string }
  | { type: 'llm_update'; providerId: string; model: string; temperature?: number };

/**
 * 确认队列项
 */
interface ConfirmationQueueItem {
  command: string;
  analysis: DangerAnalysis;
  resolve: (confirmed: boolean) => void;
}

/**
 * WebSocket 数据
 */
interface WebSocketData {
  config: Config;
  llmConfig: Config['llm'];
  maxSteps: number;
  pendingConfirmations: Map<string, (confirmed: boolean) => void>;
  confirmationQueue: ConfirmationQueueItem[];
  isProcessingConfirmation: boolean;
  agent?: Agent;  // 延迟初始化
  shouldStop?: boolean;  // 停止标志
  currentMessageId?: string;  // 当前消息ID
}

function createConnectionData(config: Config): WebSocketData {
  return {
    config,
    llmConfig: config.llm,
    maxSteps: 999,
    pendingConfirmations: new Map<string, (confirmed: boolean) => void>(),
    confirmationQueue: [],
    isProcessingConfirmation: false,
  };
}

const AUDIT_LEVELS = new Set(['safe', 'warning', 'danger', 'critical']);
const AUDIT_ACTIONS = new Set(['approved', 'rejected', 'auto_blocked']);

interface AuditFilterOptions {
  limit: number;
  level: string | null;
  action: string | null;
}

function applyAuditFilters(logs: AuditEntry[], filters: AuditFilterOptions): AuditEntry[] {
  const filtered = logs.filter((log) => {
    if (filters.level && log.dangerLevel !== filters.level) return false;
    if (filters.action && log.action !== filters.action) return false;
    return true;
  });
  const limited = filtered.slice(-filters.limit);
  return limited.reverse();
}

function summarizeAuditLogs(logs: AuditEntry[]) {
  const summary = {
    total: logs.length,
    approved: 0,
    rejected: 0,
    autoBlocked: 0,
    byLevel: {
      safe: 0,
      warning: 0,
      danger: 0,
      critical: 0,
    },
  };
  for (const log of logs) {
    if (log.action === 'approved') summary.approved += 1;
    else if (log.action === 'rejected') summary.rejected += 1;
    else if (log.action === 'auto_blocked') summary.autoBlocked += 1;
    summary.byLevel[log.dangerLevel] += 1;
  }
  return summary;
}

function auditLogsToCsv(logs: AuditEntry[]): string {
  const header = ['timestamp', 'dangerLevel', 'action', 'command', 'reasons', 'resultSuccess', 'resultExitCode', 'resultError'];
  const rows = logs.map((log) => {
    const reasons = log.reasons?.join('; ') || '';
    const success = log.executionResult?.success ?? null;
    const exitCode = log.executionResult?.exitCode ?? '';
    const error = log.executionResult?.error ?? '';
    const values = [log.timestamp, log.dangerLevel, log.action, log.command, reasons, success !== null ? String(success) : '', exitCode !== '' ? String(exitCode) : '', error];
    return values.map((value) => {
      const str = value ?? '';
      const needsQuote = typeof str === 'string' && (str.includes(',') || str.includes('"') || str.includes('\n'));
      if (!needsQuote) {
        return str;
      }
      return `"${String(str).replace(/"/g, '""')}"`;
    }).join(',');
  });
  return [header.join(','), ...rows].join('\n');
}

/**
 * 启动 WebUI 服务器
 */
export async function startWebServer(port: number = 3000) {
  // 加载配置
  const config = await loadConfig();

  console.log('🚀 Initializing SanBot WebUI...');

  // 设置模式
  setInteractiveMode(true);
  setTuiMode(false); // WebUI 不是 TUI 模式

  // Session 池 - 保持 Agent 实例在 WebSocket 断开后存活
  // key: sessionId, value: Agent 实例
  const sessionPool = new Map<string, Agent>();
  // 当前活跃的 sessionId（单用户场景，只有一个活跃 session）
  let activeSessionIdForPool: string | null = null;

  // 静态文件目录 - 优先使用 frontend/dist，回退到 static
  const frontendDistDir = join(import.meta.dir, 'frontend', 'dist');
  const staticDir = join(import.meta.dir, 'static');

  // 检查是否有构建好的前端
  const frontendIndexFile = Bun.file(join(frontendDistDir, 'index.html'));
  const useFrontendDist = await frontendIndexFile.exists();
  const distDir = useFrontendDist ? frontendDistDir : staticDir;

  console.log(`📁 Serving static files from: ${distDir}`);

  // 创建服务器
  const server = Bun.serve<WebSocketData>({
    port,
    async fetch(req, server) {
      const url = new URL(req.url);

      // WebSocket 升级
        if (url.pathname === '/ws') {
          const upgraded = server.upgrade(req, {
            data: createConnectionData(config),
          });

        if (upgraded) {
          return undefined;
        }

        return new Response('WebSocket upgrade failed', { status: 500 });
      }

      // 静态文件服务
      if (!url.pathname.startsWith('/api') && url.pathname !== '/ws') {
        // 确定文件路径
        const requestPath = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
        const filePath = join(distDir, requestPath);
        const file = Bun.file(filePath);

        if (await file.exists()) {
          // Bun 自动推断 Content-Type
          return new Response(file);
        }

        // SPA fallback - 对于非文件请求返回 index.html
        const indexFile = Bun.file(join(distDir, 'index.html'));
        if (await indexFile.exists()) {
          return new Response(indexFile, {
            headers: { 'Content-Type': 'text/html' },
          });
        }

        return new Response('Not Found', { status: 404 });
      }

      if (url.pathname === '/api/audit/today') {
        const limitParam = url.searchParams.get('limit');
        const parsedLimit = limitParam ? Number.parseInt(limitParam, 10) : 100;
        const limit = Number.isFinite(parsedLimit) && parsedLimit > 0
          ? Math.min(parsedLimit, 500)
          : 100;
        const pageParam = url.searchParams.get('page');
        const pageSizeParam = url.searchParams.get('pageSize');
        const parsedPage = pageParam ? Number.parseInt(pageParam, 10) : 1;
        const parsedPageSize = pageSizeParam ? Number.parseInt(pageSizeParam, 10) : 20;
        const pageSize = Number.isFinite(parsedPageSize) && parsedPageSize > 0
          ? Math.min(parsedPageSize, 100)
          : 20;
        const requestedPage = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;

        const levelFilter = url.searchParams.get('level');
        const actionFilter = url.searchParams.get('action');
        const normalizedLevel = levelFilter && AUDIT_LEVELS.has(levelFilter) ? levelFilter : null;
        const normalizedAction = actionFilter && AUDIT_ACTIONS.has(actionFilter) ? actionFilter : null;

        const [stats, logs] = await Promise.all([
          getAuditStats(),
          getTodayAuditLogs(),
        ]);

        const filteredLogs = applyAuditFilters(logs, {
          limit,
          level: normalizedLevel,
          action: normalizedAction,
        });
        const filteredStats = summarizeAuditLogs(filteredLogs);

        const total = filteredLogs.length;
        const totalPages = Math.max(1, Math.ceil(total / pageSize));
        const page = Math.min(requestedPage, totalPages);
        const startIndex = (page - 1) * pageSize;
        const pagedLogs = filteredLogs.slice(startIndex, startIndex + pageSize);
        const [today] = new Date().toISOString().split('T');

        return Response.json({
          date: today,
          stats,
          filteredStats,
          logs: pagedLogs,
          pagination: {
            page,
            pageSize,
            total,
            totalPages,
          },
          filters: {
            level: normalizedLevel,
            action: normalizedAction,
            limit,
          },
        });
      }

      if (url.pathname === '/api/audit/export') {
        const format = (url.searchParams.get('format') || 'json').toLowerCase();
        const limitParam = url.searchParams.get('limit');
        const parsedLimit = limitParam ? Number.parseInt(limitParam, 10) : 1000;
        const limit = Number.isFinite(parsedLimit) && parsedLimit > 0
          ? Math.min(parsedLimit, 5000)
          : 1000;
        const levelFilter = url.searchParams.get('level');
        const actionFilter = url.searchParams.get('action');
        const normalizedLevel = levelFilter && AUDIT_LEVELS.has(levelFilter) ? levelFilter : null;
        const normalizedAction = actionFilter && AUDIT_ACTIONS.has(actionFilter) ? actionFilter : null;

        const [stats, logs] = await Promise.all([
          getAuditStats(),
          getTodayAuditLogs(),
        ]);

        const filteredLogs = applyAuditFilters(logs, {
          limit,
          level: normalizedLevel,
          action: normalizedAction,
        });
        const filteredStats = summarizeAuditLogs(filteredLogs);
        const [today] = new Date().toISOString().split('T');

        if (format === 'csv') {
          const csv = auditLogsToCsv(filteredLogs);
          return new Response(csv, {
            headers: {
              'Content-Type': 'text/csv; charset=utf-8',
              'Content-Disposition': `attachment; filename="sanbot-audit-${today}.csv"`,
            },
          });
        }

        return Response.json({
          date: today,
          stats,
          filteredStats,
          logs: filteredLogs,
          filters: {
            level: normalizedLevel,
            action: normalizedAction,
            limit,
          },
        });
      }

      if (url.pathname === '/api/tools') {
        const pageParam = url.searchParams.get('page');
        const pageSizeParam = url.searchParams.get('pageSize');
        const query = (url.searchParams.get('q') || '').trim().toLowerCase();
        const tag = (url.searchParams.get('tag') || '').trim().toLowerCase();

        const parsedPage = pageParam ? Number.parseInt(pageParam, 10) : 1;
        const parsedPageSize = pageSizeParam ? Number.parseInt(pageSizeParam, 10) : 20;
        const pageSize = Number.isFinite(parsedPageSize) && parsedPageSize > 0
          ? Math.min(parsedPageSize, 100)
          : 20;
        const requestedPage = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;

        const registry = await loadToolRegistry();
        const allTools = Object.values(registry.tools)
          .filter((tool) => {
            const matchesQuery = query.length === 0
              || tool.name.toLowerCase().includes(query)
              || tool.description.toLowerCase().includes(query);
            const matchesTag = tag.length === 0
              || tool.tags.some((item) => item.toLowerCase() === tag);
            return matchesQuery && matchesTag;
          })
          .sort((a, b) => {
            const aTime = a.lastUsedAt || a.updatedAt;
            const bTime = b.lastUsedAt || b.updatedAt;
            return bTime.localeCompare(aTime);
          });

        const total = allTools.length;
        const totalPages = Math.max(1, Math.ceil(total / pageSize));
        const page = Math.min(requestedPage, totalPages);
        const startIndex = (page - 1) * pageSize;
        const tools = allTools.slice(startIndex, startIndex + pageSize);

        return Response.json({
          tools,
          pagination: {
            page,
            pageSize,
            total,
            totalPages,
          },
          filters: {
            q: query || null,
            tag: tag || null,
          },
        });
      }

      if (url.pathname === '/api/tools/logs') {
        const name = url.searchParams.get('name');
        const limitParam = url.searchParams.get('limit');
        const limit = limitParam ? Number.parseInt(limitParam, 10) : 10;
        if (!name) {
          return new Response('Missing tool name', { status: 400 });
        }
        const logs = await getToolLogs(name, Number.isFinite(limit) && limit > 0 ? limit : 10);
        return Response.json({ tool: name, logs });
      }

      if (url.pathname === '/api/tools/run' && req.method === 'POST') {
        let payload: any;
        try {
          payload = await req.json();
        } catch {
          return new Response('Invalid JSON body', { status: 400 });
        }

        const name = typeof payload?.name === 'string' ? payload.name : '';
        if (!name) {
          return new Response('Missing tool name', { status: 400 });
        }

        const params = payload?.params;
        const args = typeof payload?.args === 'string' ? payload.args : '';
        const stdin = typeof payload?.stdin === 'string' ? payload.stdin : undefined;

        try {
          if (params && typeof params === 'object') {
            const meta = await getToolMeta(name);
            if (!meta) {
              return new Response('Tool not found', { status: 404 });
            }
            const tool = createDynamicToolDef(meta);
            const result = await tool.execute(params);
            return Response.json(result);
          }

          const runResult = await runToolTool.execute({ name, args, stdin });
          return Response.json(runResult);
        } catch (error: any) {
          return Response.json(
            {
              success: false,
              error: error?.message || 'Failed to run tool',
            },
            { status: 500 }
          );
        }
      }

      if (url.pathname === '/api/context') {
        const limitParam = url.searchParams.get('limit');
        const parsedLimit = limitParam ? Number.parseInt(limitParam, 10) : 5;
        const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 20) : 5;
        const context = await getSessionContext();
        const injection = formatMemoryContext(context);
        const recentConversations = context.todayConversations
          .slice(-limit)
          .map((entry) => ({
            timestamp: entry.timestamp,
            userMessage: entry.userMessage,
            assistantResponse: entry.assistantResponse,
          }));
        const events = await getRecentContextEvents(10);
        return Response.json({
          updatedAt: new Date().toISOString(),
          summary: context.summary || null,
          recentConversations,
          totalConversations: context.todayConversations.length,
          events,
          extracted: context.extracted || null,
          injection,
        });
      }

      return new Response('Not Found', { status: 404 });
    },

    websocket: {
      open(ws: ServerWebSocket<WebSocketData>) {
        console.log('✅ Client connected');

        const providerId = resolveProviderId(ws.data.config);
        sendProviderConfig(ws, providerId).catch((error) => {
          console.warn('[WebSocket] Failed to send provider config:', error);
        });

        // 尝试复用 session 池中的 Agent，否则创建新的
        const existingAgent = activeSessionIdForPool ? sessionPool.get(activeSessionIdForPool) : null;

        const initAgent = async () => {
          let agent: Agent;
          let isReconnect = false;

          if (existingAgent) {
            // 复用已有 Agent（页面刷新场景）
            agent = existingAgent;
            isReconnect = true;
            console.log(`[WebSocket] Reusing agent for session: ${agent.getSessionId()}`);
          } else {
            // 创建新 Agent
            agent = new Agent({
              llmConfig: ws.data.llmConfig,
              maxSteps: ws.data.maxSteps,
            });
            await agent.init();
            console.log(`[WebSocket] New agent created for session: ${agent.getSessionId()}`);
          }

          ws.data.agent = agent;
          const sessionId = agent.getSessionId();
          sessionPool.set(sessionId, agent);
          activeSessionIdForPool = sessionId;

          // 发送当前 session 的对话历史
          try {
            const sessionConversations = await loadSessionConversations(sessionId);
            if (sessionConversations.length > 0) {
              const historyMsg: WebSocketMessage = {
                type: 'chat_history',
                messages: sessionConversations.map((c) => ({
                  timestamp: c.timestamp,
                  userMessage: c.userMessage,
                  assistantResponse: c.assistantResponse,
                  toolCalls: c.toolCalls?.map((t) => ({
                    name: t.name,
                    args: t.args,
                    result: t.result,
                  })),
                })),
              };
              ws.send(JSON.stringify(historyMsg));
            }
          } catch (error) {
            console.warn('[WebSocket] Failed to send chat history:', error);
          }

          // 只在新 session 时生成问候语，刷新不重复
          if (!isReconnect) {
            const projectContext = `Current working directory: ${process.cwd()}`;
            agent.generateGreeting(projectContext)
              .then((greeting) => {
                ws.send(JSON.stringify({ type: 'assistant_start' } as WebSocketMessage));
                ws.send(JSON.stringify({ type: 'assistant_delta', content: greeting } as WebSocketMessage));
                ws.send(JSON.stringify({ type: 'assistant_end', content: greeting } as WebSocketMessage));
              })
              .catch((error) => {
                console.error('Error generating greeting:', error);
              });
          }
        };

        initAgent().catch((error) => {
          console.error('Error initializing agent:', error);
        });

        // 设置 WebSocket 确认回调（每个连接独立，使用队列）
        const connectionId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        setWebSocketConfirmCallback(connectionId, async (command: string, analysis: DangerAnalysis) => {
          console.log(`[WebSocket][${connectionId}] Queueing confirmation request`);
          console.log(`[WebSocket][${connectionId}] Command:`, command);
          console.log(`[WebSocket][${connectionId}] Level:`, analysis.level);
          console.log(`[WebSocket][${connectionId}] Current queue size: ${ws.data.confirmationQueue.length}`);

          return await new Promise((resolve) => {
            // 将确认请求加入队列
            ws.data.confirmationQueue.push({
              command,
              analysis,
              resolve,
            });

            console.log(`[WebSocket][${connectionId}] Added to queue. New size: ${ws.data.confirmationQueue.length}`);

            // 如果这是队列中唯一的请求，立即处理
            if (ws.data.confirmationQueue.length === 1) {
              processNextConfirmation(ws);
            }
          });
        });

        // 存储连接 ID 到 ws.data
        (ws.data as any).connectionId = connectionId;

        // 发送欢迎消息
        const welcomeMsg: WebSocketMessage = {
          type: 'system',
          message: 'Connected to SanBot',
        };
        ws.send(JSON.stringify(welcomeMsg));
      },

      async message(ws: ServerWebSocket<WebSocketData>, message: string | Buffer) {
        try {
          const data: ClientMessage = JSON.parse(message.toString());

          // 处理确认响应
          if (data.type === 'confirm_response') {
            const callback = ws.data.pendingConfirmations.get(data.confirmId);
            if (callback) {
              console.log(`[WebSocket] Received confirm response for ${data.confirmId}: ${data.confirmed}`);
              callback(data.confirmed);
              ws.data.pendingConfirmations.delete(data.confirmId);

              // 完成当前确认并继续处理队列中的下一个
              completeConfirmation(ws);
            } else {
              console.warn(`⚠️ Unknown confirmation ID: ${data.confirmId}`);
            }
            return;
          }

          if (data.type === 'stop_request') {
            console.log(`[WebSocket] Received stop request for message: ${data.messageId}`);
            ws.data.shouldStop = true;
            ws.data.currentMessageId = data.messageId;

            // 清空确认队列
            ws.data.confirmationQueue = [];
            ws.data.isProcessingConfirmation = false;

            // 先结束当前 assistant 流式输出
            const endMsg: WebSocketMessage = {
              type: 'assistant_end',
              content: '',
            };
            ws.send(JSON.stringify(endMsg));

            const sysMsg: WebSocketMessage = {
              type: 'system',
              message: 'Request stopped',
            };
            ws.send(JSON.stringify(sysMsg));
            return;
          }

          if (data.type === 'llm_get_providers') {
            const providerId = resolveProviderId(ws.data.config);
            await sendProviderConfig(ws, providerId);
            return;
          }

          if (data.type === 'llm_get_models') {
            const models = await getProviderModels(data.providerId, ws.data.config);
            const modelsMsg: WebSocketMessage = {
              type: 'llm_models',
              providerId: data.providerId,
              models,
            };
            ws.send(JSON.stringify(modelsMsg));
            return;
          }

          if (data.type === 'llm_update') {
            try {
              const requestedTemperature =
                typeof data.temperature === 'number'
                  ? data.temperature
                  : ws.data.config.llm.temperature;
              await updateActiveProvider(
                ws.data.config,
                data.providerId,
                data.model,
                ws.data.config.llm.apiKey,
                { temperature: requestedTemperature }
              );
              ws.data.llmConfig = ws.data.config.llm;
              if (ws.data.agent) {
                ws.data.agent.updateLLMConfig(ws.data.config.llm);
              }
              const okMsg: WebSocketMessage = {
                type: 'llm_update_result',
                success: true,
                providerId: data.providerId,
                model: data.model,
                temperature: ws.data.config.llm.temperature,
              };
              ws.send(JSON.stringify(okMsg));
              await sendProviderConfig(ws, data.providerId);
            } catch (updateError: any) {
              const errMsg: WebSocketMessage = {
                type: 'llm_update_result',
                success: false,
                error: updateError?.message || 'Failed to update LLM config',
              };
              ws.send(JSON.stringify(errMsg));
            }
            return;
          }

          if (data.type === 'chat') {
            // 等待 Agent 初始化完成
            const agent = ws.data.agent;
            if (!agent) {
              const errorMsg: WebSocketMessage = {
                type: 'system',
                message: 'Agent is still initializing. Please wait...',
              };
              ws.send(JSON.stringify(errorMsg));
              return;
            }

            // 重置停止标志
            ws.data.shouldStop = false;

            // 设置当前活跃的 sessionId（用于确认回调路由）
            const connectionId = (ws.data as any).connectionId;
            if (connectionId) {
              setActiveSessionId(connectionId);
            }

            // 回显用户消息
            const userMsg: WebSocketMessage = {
              type: 'user_message',
              content: data.content,
            };
            ws.send(JSON.stringify(userMsg));

            // 发送状态
            const statusMsg: WebSocketMessage = {
              type: 'status',
              status: 'thinking',
            };
            ws.send(JSON.stringify(statusMsg));

            // 开始助手消息
            const startMsg: WebSocketMessage = {
              type: 'assistant_start',
            };
            ws.send(JSON.stringify(startMsg));

            // 创建适配器
            const streamWriter = new WebStreamWriter(ws);
            const toolSpinner = new WebToolSpinner(ws);

            try {
              // 执行对话
              await agent.chatStream(data.content, streamWriter, toolSpinner);
            } catch (chatError: any) {
              console.error('❌ Chat stream error:', chatError);
              const errorMsg: WebSocketMessage = {
                type: 'system',
                message: `Chat error: ${chatError.message || 'Unknown error'}`,
              };
              ws.send(JSON.stringify(errorMsg));
            } finally {
              // 清除活跃的 sessionId
              const connectionId = (ws.data as any).connectionId;
              if (connectionId) {
                clearActiveSessionId();
              }
            }

            // 如果被停止，不再发送结束消息
            if (!ws.data.shouldStop) {
              // 结束助手消息
              streamWriter.end();

              // 更新状态
              const idleMsg: WebSocketMessage = {
                type: 'status',
                status: 'idle',
              };
              ws.send(JSON.stringify(idleMsg));
            }
          } else if (data.type === 'command') {
            // 处理命令
            const cmd = data.command.toLowerCase();

            if (cmd === '/clear' || cmd === '/new') {
              // /clear: 清空当前 session 历史
              // /new: 创建全新 session（新 Agent 实例）
              if (cmd === '/new') {
                // 创建新 Agent，获得新 sessionId
                const newAgent = new Agent({
                  llmConfig: ws.data.llmConfig,
                  maxSteps: ws.data.maxSteps,
                });
                await newAgent.init();
                ws.data.agent = newAgent;

                // 更新 session 池
                const newSessionId = newAgent.getSessionId();
                sessionPool.set(newSessionId, newAgent);
                activeSessionIdForPool = newSessionId;

                const sysMsg: WebSocketMessage = {
                  type: 'system',
                  message: 'New session created.',
                };
                ws.send(JSON.stringify(sysMsg));

                // 生成新问候语
                const projectContext = `Current working directory: ${process.cwd()}`;
                newAgent.generateGreeting(projectContext)
                  .then((greeting) => {
                    ws.send(JSON.stringify({ type: 'assistant_start' } as WebSocketMessage));
                    ws.send(JSON.stringify({ type: 'assistant_delta', content: greeting } as WebSocketMessage));
                    ws.send(JSON.stringify({ type: 'assistant_end', content: greeting } as WebSocketMessage));
                  })
                  .catch((error) => {
                    console.error('Error generating greeting:', error);
                  });
              } else {
                ws.data.agent?.clearHistory();
                const sysMsg: WebSocketMessage = {
                  type: 'system',
                  message: 'Conversation history cleared.',
                };
                ws.send(JSON.stringify(sysMsg));
              }
            } else if (cmd === '/help') {
              const sysMsg: WebSocketMessage = {
                type: 'system',
                message: 'Commands: /clear, /help',
              };
              ws.send(JSON.stringify(sysMsg));
            } else {
              const sysMsg: WebSocketMessage = {
                type: 'system',
                message: `Unknown command: ${data.command}`,
              };
              ws.send(JSON.stringify(sysMsg));
            }
          }
        } catch (error: any) {
          console.error('Error handling message:', error);
          const errorMsg: WebSocketMessage = {
            type: 'system',
            message: `Error: ${error.message}`,
          };
          ws.send(JSON.stringify(errorMsg));
        }
      },

      close(ws: ServerWebSocket<WebSocketData>) {
        console.log('❌ Client disconnected');
        // 移除 WebSocket 确认回调
        const connectionId = (ws.data as any).connectionId;
        if (connectionId) {
          removeWebSocketConfirmCallback(connectionId);
          console.log(`[WebSocket] Removed confirmation callback for ${connectionId}`);
        }
      },
    },
  });

  console.log(`✨ SanBot WebUI running at http://localhost:${port}`);
  console.log(`📡 WebSocket endpoint: ws://localhost:${port}/ws`);
  console.log('');
  console.log('Press Ctrl+C to stop');
}

function resolveProviderId(config: Config): string {
  const providers = getAvailableProviders(config);
  const entries = Object.entries(providers);
  if (config.llm.provider !== 'openai-compatible') {
    const match = entries.find(([, provider]) => provider.provider === config.llm.provider);
    return match ? match[0] : config.llm.provider;
  }

  if (config.llm.baseUrl) {
    const match = entries.find(([, provider]) => provider.baseUrl === config.llm.baseUrl);
    if (match) return match[0];
  }

  return 'openai';
}

async function sendProviderConfig(ws: ServerWebSocket<WebSocketData>, providerId: string): Promise<void> {
  const providers = getAvailableProviders(ws.data.config);
  const providerList = Object.entries(providers).map(([id, provider]) => ({
    id,
    name: provider.name,
    description: provider.description,
    provider: provider.provider,
  }));
  const models = await getProviderModels(providerId, ws.data.config);
  const configMsg: WebSocketMessage = {
    type: 'llm_config',
    providerId,
    model: ws.data.config.llm.model,
    providers: providerList,
    models,
    temperature: ws.data.config.llm.temperature,
  };
  ws.send(JSON.stringify(configMsg));
}

/**
 * 处理确认队列中的下一个请求
 */
function processNextConfirmation(ws: ServerWebSocket<WebSocketData>): void {
  const data = ws.data;

  // 如果队列为空或正在处理，直接返回
  if (data.confirmationQueue.length === 0 || data.isProcessingConfirmation) {
    return;
  }

  // 标记为正在处理
  data.isProcessingConfirmation = true;

  // 取出队列中的第一个请求
  const item = data.confirmationQueue[0];
  if (!item) {
    data.isProcessingConfirmation = false;
    return;
  }
  const { command, analysis, resolve } = item;

  const confirmId = `confirm-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  console.log(`[WebSocket] Processing queued confirmation: ${confirmId}`);
  console.log(`[WebSocket] Command:`, command);
  console.log(`[WebSocket] Level:`, analysis.level);
  console.log(`[WebSocket] Queue size: ${data.confirmationQueue.length}`);

  // 存储 resolve 函数
  data.pendingConfirmations.set(confirmId, resolve);

  // 发送确认请求到前端
  try {
    const confirmMsg: WebSocketMessage = {
      type: 'confirm_request',
      id: confirmId,
      command,
      level: analysis.level,
      reasons: analysis.reasons,
    };
    const msgStr = JSON.stringify(confirmMsg);
    console.log(`[WebSocket] Sending message:`, msgStr.substring(0, 200) + '...');
    ws.send(msgStr);
  } catch (err: any) {
    console.error('[WebSocket] Error sending confirm request:', err);
    resolve(false);
    // 移除当前项并继续处理下一个
    data.confirmationQueue.shift();
    data.isProcessingConfirmation = false;
    processNextConfirmation(ws);
  }
}

/**
 * 完成当前确认并继续处理下一个
 */
function completeConfirmation(ws: ServerWebSocket<WebSocketData>): void {
  const data = ws.data;

  // 移除已完成的确认
  if (data.confirmationQueue.length > 0) {
    data.confirmationQueue.shift();
  }

  // 重置处理标志
  data.isProcessingConfirmation = false;

  // 处理队列中的下一个确认
  if (data.confirmationQueue.length > 0) {
    console.log(`[WebSocket] Confirmation completed, processing next. Queue size: ${data.confirmationQueue.length}`);
    processNextConfirmation(ws);
  } else {
    console.log(`[WebSocket] All confirmations processed`);
  }
}

// 如果直接运行此文件，启动服务器
if (import.meta.main) {
  startWebServer().catch(err => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
}
