import Anthropic from '@anthropic-ai/sdk';
import { generateText, jsonSchema, streamText, stepCountIs, type ModelMessage } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import type { Config } from './config/types.ts';
import { createToolRegistry, createToolRegistryWithDynamic, type ToolRegistry } from './tools/index.ts';
import {
  saveConversation,
  getSessionContext,
  formatMemoryContext,
  appendSessionSummary,
  appendExtractedMemory,
  type ToolCallRecord,
  type ConversationRecord,
} from './memory/index.ts';
import { loadSoul } from './birth/index.ts';
import { ToolSpinner, StreamWriter } from './tui/index.ts';
import type { ToolSpinnerInterface, StreamWriterInterface } from './tui/index.ts';
import {
  gatherRuntimeContext,
  formatRuntimeContext,
  ContextCompactor,
  type CompactionConfig,
} from './context/index.ts';
import { SubagentRunner, type SubagentTask, type SubagentResult } from './agent/subagent.ts';
import {
  MCPManager,
  loadMCPConfig,
  getMCPToolDefs,
  type MCPServerConfig,
} from './mcp/index.ts';
import { pc } from './tui-v3/utils.ts';

type CoreMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
};

/**
 * Agent 配置
 */
export interface AgentConfig {
  llmConfig: Config['llm'];
  maxSteps?: number;
  sessionId?: string;
  compaction?: Partial<CompactionConfig>;
  /** 是否启用 MCP */
  enableMCP?: boolean;
}

/**
 * Agent 核心类 - 支持多服务商
 */
export class Agent {
  private toolRegistry: ToolRegistry;
  private config: AgentConfig;
  private sessionId: string;
  // 对话历史 - 支持多轮对话
  private conversationHistory: Anthropic.MessageParam[] = [];
  private openaiHistory: ModelMessage[] = [];
  // 当前对话的工具调用记录
  private currentToolCalls: ToolCallRecord[] = [];
  // 记忆上下文
  private memoryContext: string = '';
  private runtimeContext: string = '';
  private shortTermSummary: string = '';
  // 灵魂记录
  private soulContext: string = '';
  // 是否已初始化
  private initialized: boolean = false;
  // 上下文压缩器
  private compactor: ContextCompactor;
  // MCP 管理器
  private mcpManager: MCPManager | null = null;

  constructor(config: AgentConfig) {
    this.config = config;
    this.sessionId =
      config.sessionId || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    // 先用同步版本，init 时会替换
    this.toolRegistry = createToolRegistry();
    // 初始化上下文压缩器
    this.compactor = new ContextCompactor(config.llmConfig, config.compaction);
  }

  /**
   * 初始化 Agent（加载记忆和自创建工具）
   */
  async init(): Promise<void> {
    if (this.initialized) return;

    // 并行加载记忆、灵魂、自创建工具
    const [context, soul, registry, runtime] = await Promise.all([
      getSessionContext(),
      loadSoul(),
      createToolRegistryWithDynamic(),
      gatherRuntimeContext(process.cwd()).catch(() => null),
    ]);

    this.memoryContext = formatMemoryContext(context);
    this.soulContext = soul || '';
    this.toolRegistry = registry;
    if (runtime) {
      this.runtimeContext = formatRuntimeContext(runtime);
    }

    // 初始化 MCP（如果启用）
    if (this.config.enableMCP) {
      await this.initMCP();
    }

    this.initialized = true;
  }

  /**
   * 初始化 MCP 连接
   */
  private async initMCP(): Promise<void> {
    try {
      const mcpConfig = await loadMCPConfig();
      if (mcpConfig.servers.length === 0) {
        return;
      }

      this.mcpManager = new MCPManager();
      for (const server of mcpConfig.servers) {
        this.mcpManager.addServer(server);
      }

      await this.mcpManager.connectAll();

      // 将 MCP 工具注册到工具注册表
      for (const { server, tool } of this.mcpManager.getAllTools()) {
        const client = this.mcpManager.getClient(server);
        if (client) {
          const toolDefs = getMCPToolDefs(client);
          for (const toolDef of toolDefs) {
            this.toolRegistry.register(toolDef);
          }
        }
      }

      console.log(pc.gray(`[Agent] MCP initialized with ${this.mcpManager.getAllTools().length} tools`));
    } catch (error: any) {
      console.warn(pc.yellow(`[Agent] MCP initialization failed: ${error.message}`));
    }
  }

  /**
   * 初始化记忆上下文（兼容旧接口）
   * @deprecated 使用 init() 代替
   */
  async initMemory(): Promise<void> {
    await this.init();
  }

  /**
   * 热更新 LLM 配置
   */
  updateLLMConfig(llmConfig: Config['llm']): void {
    this.config.llmConfig = llmConfig;
    // 清空对话历史，因为不同模型的上下文格式可能不同
    this.conversationHistory = [];
    this.openaiHistory = [];
    // 更新 compactor 的 LLM 配置
    this.compactor = new ContextCompactor(llmConfig, this.config.compaction);
    console.log(pc.gray(`[Agent] LLM config updated: ${llmConfig.provider} / ${llmConfig.model}`));
  }

  /**
   * 获取当前配置
   */
  getConfig(): AgentConfig {
    return { ...this.config };
  }

  /**
   * 获取当前会话 ID
   */
  getSessionId(): string {
    return this.sessionId;
  }

  /**
   * 清空对话历史
   */
  clearHistory(): void {
    this.conversationHistory = [];
    this.openaiHistory = [];
  }

  /**
   * 从持久化记录恢复会话历史（用于服务重启后的上下文延续）
   */
  hydrateConversationHistory(records: ConversationRecord[], maxTurns: number = 30): void {
    const safeMaxTurns = Number.isFinite(maxTurns) && maxTurns > 0
      ? Math.min(Math.floor(maxTurns), 100)
      : 30;

    const trimmedRecords = records
      .filter((record) => Boolean(record?.userMessage || record?.assistantResponse))
      .slice(-safeMaxTurns);

    const anthropicHistory: Anthropic.MessageParam[] = [];
    const openaiHistory: ModelMessage[] = [];

    for (const record of trimmedRecords) {
      const userMessage = record.userMessage?.trim();
      const assistantResponse = record.assistantResponse?.trim();

      if (userMessage) {
        anthropicHistory.push({ role: 'user', content: userMessage });
        openaiHistory.push({ role: 'user', content: userMessage });
      }

      if (assistantResponse) {
        anthropicHistory.push({ role: 'assistant', content: assistantResponse });
        openaiHistory.push({ role: 'assistant', content: assistantResponse });
      }
    }

    this.conversationHistory = anthropicHistory;
    this.openaiHistory = openaiHistory;

    console.log(pc.gray(`[Agent] Restored ${trimmedRecords.length} turns for session ${this.sessionId}`));
  }

  /**
   * 委派任务给子代理执行
   * 子代理在独立上下文中工作，只回传结构化摘要
   */
  async delegateToSubagent(task: SubagentTask): Promise<SubagentResult> {
    const runner = new SubagentRunner(this.config.llmConfig);
    return runner.run(task);
  }

  /**
   * 并行委派多个任务给子代理
   */
  async delegateParallel(tasks: SubagentTask[]): Promise<SubagentResult[]> {
    const runner = new SubagentRunner(this.config.llmConfig);
    return runner.runParallel(tasks);
  }

  /**
   * 将子代理结果合并为可注入上下文的摘要
   */
  mergeSubagentResults(results: SubagentResult[]): string {
    return SubagentRunner.mergeResults(results);
  }

  /**
   * 清理过长的对话历史（使用 Compaction 策略）
   * 保留最近的消息，避免 token 超限
   */
  private async trimConversationHistory(): Promise<void> {
    // 使用 compactor 检查是否需要压缩
    if (this.compactor.shouldCompact(this.conversationHistory)) {
      const result = await this.compactor.compact(
        this.conversationHistory,
        this.sessionId
      );

      if (result.compacted) {
        // 保留最近的消息
        const keepCount = 20; // 与 compaction config 保持一致
        this.conversationHistory = this.conversationHistory.slice(-keepCount);

        // 更新短期摘要
        if (result.summary) {
          this.shortTermSummary = this.mergeShortSummary(
            result.summary,
            this.shortTermSummary
          );
        }
      }
    }

    // 同样处理 OpenAI history
    if (this.compactor.shouldCompact(this.openaiHistory as any)) {
      const result = await this.compactor.compact(
        this.openaiHistory as any,
        this.sessionId
      );

      if (result.compacted) {
        const keepCount = 20;
        this.openaiHistory = this.openaiHistory.slice(-keepCount);

        if (result.summary && !this.shortTermSummary.includes(result.summary)) {
          this.shortTermSummary = this.mergeShortSummary(
            result.summary,
            this.shortTermSummary
          );
        }
      }
    }
  }

  private handleHistoryRemoval(messages: Array<{ role: string; content: any }>): void {
    if (!messages.length) return;
    const fragment = this.createHistoryFragment(messages);
    if (!fragment) return;
    this.shortTermSummary = this.mergeShortSummary(fragment, this.shortTermSummary);
    appendSessionSummary(this.sessionId, fragment).catch((error) => {
      console.warn('Unable to persist session summary', error);
    });
    appendExtractedMemory('runtime', fragment).catch((error) => {
      console.warn('Unable to persist extracted memory', error);
    });
  }

  private createHistoryFragment(messages: Array<{ role: string; content: any }>): string {
    const snapshots = messages
      .map((msg) => {
        const text = this.normalizeMessageContent(msg.content);
        if (!text) return '';
        return `[${msg.role}] ${text}`;
      })
      .filter(Boolean);
    return snapshots.join(' | ');
  }

  private mergeShortSummary(fragment: string, existing: string): string {
    if (!fragment) return existing;
    const combined = existing ? `${existing}\n${fragment}` : fragment;
    const maxChars = 2000;
    return combined.length > maxChars ? combined.slice(combined.length - maxChars) : combined;
  }

  private normalizeMessageContent(content: any): string {
    if (!content) return '';
    if (typeof content === 'string') {
      return content.slice(0, 240);
    }
    if (Array.isArray(content)) {
      return content
        .map((block) => {
          if (typeof block === 'string') return block;
          if (block && typeof block === 'object' && 'text' in block) {
            return String(block.text);
          }
          if (block && typeof block === 'object' && 'type' in block) {
            return `[${block.type}]`;
          }
          return '';
        })
        .filter(Boolean)
        .join(' ')
        .slice(0, 240);
    }
    if (content && typeof content === 'object' && 'content' in content) {
      return this.normalizeMessageContent((content as any).content);
    }
    try {
      return JSON.stringify(content).slice(0, 240);
    } catch {
      return '';
    }
  }

  /**
   * 生成主动问候语
   * 基于用户画像、记忆和当前项目上下文
   */
  async generateGreeting(projectContext?: string): Promise<string> {
    const { provider } = this.config.llmConfig;

    const greetingPrompt = `Generate a warm, personalized greeting for the user based on the following context:

${this.memoryContext ? `## User Memory Context\n${this.memoryContext}\n` : ''}
${projectContext ? `## Current Project Context\n${projectContext}\n` : ''}

Guidelines:
1. Keep it concise (2-4 sentences)
2. Reference specific details from their profile or recent activities if available
3. Ask a relevant question about their current work or interests
4. Be friendly but professional
5. Use the user's name if known from the profile

Generate only the greeting text, no additional formatting.`;

    let greeting: string;

    if (provider === 'anthropic') {
      const client = new Anthropic({
        apiKey: this.config.llmConfig.apiKey,
        baseURL: this.config.llmConfig.baseUrl,
      });

      const response = await client.messages.create({
        model: this.config.llmConfig.model,
        max_tokens: 256,
        system: this.getSystemPrompt(),
        messages: [{ role: 'user', content: greetingPrompt }],
        temperature: this.getTemperature(),
      });

      greeting = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === 'text')
        .map((b) => b.text)
        .join('\n');
    } else {
      const openaiOptions: Record<string, unknown> = {
        apiKey: this.config.llmConfig.apiKey,
        baseURL: this.config.llmConfig.baseUrl,
        headers: this.config.llmConfig.headers,
      };
      if (this.config.llmConfig.provider === 'openai-compatible') {
        openaiOptions.compatibility = 'compatible';
      }
      const openai = createOpenAI(openaiOptions as any);

      const model = this.config.llmConfig.api === 'responses'
        ? openai.responses(this.config.llmConfig.model)
        : openai.chat(this.config.llmConfig.model);

      const result = await generateText({
        model,
        messages: [{ role: 'user', content: greetingPrompt }],
        system: this.getSystemPrompt(),
        temperature: this.getTemperature(),
      });

      greeting = result.text;
    }

    return greeting.trim();
  }

  /**
   * 执行对话（支持多轮上下文）
   */
  async chat(userMessage: string): Promise<string> {
    // 重置当前工具调用记录
    this.currentToolCalls = [];

    const { provider } = this.config.llmConfig;

    let response: string;

    // Anthropic 使用原生 SDK（更好的兼容性）
    if (provider === 'anthropic') {
      response = await this.chatWithAnthropic(userMessage);
    } else {
      // OpenAI 兼容服务商使用 AI SDK
      response = await this.chatWithOpenAI(userMessage);
    }

    // 保存对话到记忆系统
    await saveConversation(
      this.sessionId,
      userMessage,
      response,
      this.currentToolCalls.length > 0 ? this.currentToolCalls : undefined
    );

    return response;
  }

  /**
   * 流式对话（实时显示响应）
   */
  async chatStream(
    userMessage: string,
    streamWriter?: StreamWriterInterface,
    toolSpinner?: ToolSpinnerInterface
  ): Promise<string> {
    // 重置当前工具调用记录
    this.currentToolCalls = [];

    const { provider } = this.config.llmConfig;

    let response: string;

    // Anthropic 使用原生 SDK（更好的兼容性）
    if (provider === 'anthropic') {
      response = await this.chatWithAnthropicStream(userMessage, streamWriter, toolSpinner);
    } else {
      // OpenAI 兼容服务商使用 AI SDK
      response = await this.chatWithOpenAIStream(userMessage, streamWriter, toolSpinner);
    }

    // 保存对话到记忆系统
    await saveConversation(
      this.sessionId,
      userMessage,
      response,
      this.currentToolCalls.length > 0 ? this.currentToolCalls : undefined
    );

    return response;
  }

  /**
   * 使用 Anthropic SDK 对话
   */
  private async chatWithAnthropic(userMessage: string): Promise<string> {
    const client = new Anthropic({
      apiKey: this.config.llmConfig.apiKey,
      baseURL: this.config.llmConfig.baseUrl,
    });

    const tools = this.toolRegistry.getAll().map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.schema as Anthropic.Tool['input_schema'],
    }));

    // 添加用户消息到历史
    this.conversationHistory.push({ role: 'user', content: userMessage });

    let response = await client.messages.create({
      model: this.config.llmConfig.model,
      max_tokens: 4096,
      system: this.getSystemPrompt(),
      messages: this.conversationHistory,
      tools,
      temperature: this.getTemperature(),
    });

    // 处理工具调用循环
    let steps = 0;
    const maxSteps = this.config.maxSteps || 999;

    while (response.stop_reason === 'tool_use' && steps < maxSteps) {
      steps++;

      // 防御性检查：确保 content 存在且是数组
      if (!response.content || !Array.isArray(response.content)) {
        console.error('❌ Error: response.content is not an array:', response.content);
        break;
      }

      const toolUseBlocks = response.content.filter(
        (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
      );

      this.conversationHistory.push({ role: 'assistant', content: response.content });

      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const toolUse of toolUseBlocks) {
        console.log(`\n🔧 Calling tool: ${toolUse.name}`);
        console.log(`   Input: ${JSON.stringify(toolUse.input)}`);

        const tool = this.toolRegistry.get(toolUse.name);
        if (tool) {
          let result: any;
          try {
            result = await tool.execute(toolUse.input);
          } catch (error: any) {
            result = {
              success: false,
              error: error?.message || 'Tool execution failed',
            };
          }
          console.log(`   Result: ${result.success ? '✅' : '❌'}`);

          // 记录工具调用
          this.currentToolCalls.push({
            name: toolUse.name,
            input: toolUse.input,
            success: result.success,
          });

          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: JSON.stringify(result),
          });
        } else {
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: JSON.stringify({ error: `Unknown tool: ${toolUse.name}` }),
            is_error: true,
          });
        }
      }

      this.conversationHistory.push({ role: 'user', content: toolResults });

      response = await client.messages.create({
        model: this.config.llmConfig.model,
        max_tokens: 4096,
        system: this.getSystemPrompt(),
        messages: this.conversationHistory,
        tools,
        temperature: this.getTemperature(),
      });
    }

    // 如果达到 maxSteps 但 LLM 还想调用工具，强制让它生成总结
    if (response.stop_reason === 'tool_use') {
      console.log('\n⚠️ Reached max steps, requesting final summary...');

      // 添加当前响应到历史
      this.conversationHistory.push({ role: 'assistant', content: response.content });

      // 告诉 LLM 停止使用工具，生成总结
      this.conversationHistory.push({
        role: 'user',
        content: 'You have reached the maximum number of tool calls. Please summarize what you have found and provide your final response without using any more tools.',
      });

      // 不带工具的请求，强制生成文本回复
      response = await client.messages.create({
        model: this.config.llmConfig.model,
        max_tokens: 4096,
        system: this.getSystemPrompt(),
        messages: this.conversationHistory,
        temperature: this.getTemperature(),
      });
    }

    // 保存助手回复到历史
    this.conversationHistory.push({ role: 'assistant', content: response.content });

    // 防御性检查：确保 content 存在且是数组
    if (!response.content || !Array.isArray(response.content)) {
      console.error('❌ Error: response.content is not an array:', response.content);
      return '';
    }

    const textBlocks = response.content.filter(
      (block): block is Anthropic.TextBlock => block.type === 'text'
    );
    return textBlocks.map((b) => b.text).join('\n');
  }

  /**
   * 使用 OpenAI 兼容 API 对话
   */
  private async chatWithOpenAI(userMessage: string): Promise<string> {
    const openaiOptions: Record<string, unknown> = {
      apiKey: this.config.llmConfig.apiKey,
      baseURL: this.config.llmConfig.baseUrl,
      headers: this.config.llmConfig.headers,
    };
    if (this.config.llmConfig.provider === 'openai-compatible') {
      openaiOptions.compatibility = 'compatible';
    }
    const openai = createOpenAI(openaiOptions as any);

    const model = this.config.llmConfig.api === 'responses'
      ? openai.responses(this.config.llmConfig.model)
      : openai.chat(this.config.llmConfig.model);

    // 构建工具定义
    const tools: Record<string, any> = {};
    for (const t of this.toolRegistry.getAll()) {
      tools[t.name] = {
        description: t.description,
        parameters: jsonSchema(t.schema),
        execute: async (params: any) => {
          console.log(`\n🔧 Calling tool: ${t.name}`);
          console.log(`   Input: ${JSON.stringify(params)}`);
          let result: any;
          try {
            result = await t.execute(params);
          } catch (error: any) {
            result = {
              success: false,
              error: error?.message || 'Tool execution failed',
            };
          }
          console.log(`   Result: ${result.success ? '✅' : '❌'}`);
          return result;
        },
      };
    }

    // 添加用户消息到历史
    this.openaiHistory.push({ role: 'user', content: userMessage });

    const maxSteps = this.config.maxSteps || 50;
    const result = await generateText({
      model,
      messages: this.openaiHistory,
      tools,
      stopWhen: stepCountIs(maxSteps), // 允许多步工具调用
      system: this.getSystemPrompt(),
      temperature: this.getTemperature(),
    });

    // 保存助手回复到历史
    this.openaiHistory.push({ role: 'assistant', content: result.text });

    return result.text;
  }

  /**
   * 获取系统提示词
   */
  private getSystemPrompt(): string {
    // 如果有灵魂记录，使用灵魂记录作为身份基础
    const identitySection = this.soulContext
      ? `## My Soul

${this.soulContext}`
      : `## Origin Story

You were born on February 3rd, 2026, created by slicenfer - a Chinese programmer with Java background who is using AI to expand his capabilities. Your name "SanBot" comes from Chapter 42 of the Tao Te Ching: "道生一，一生二，二生三，三生万物" (The Tao gives birth to One, One gives birth to Two, Two gives birth to Three, Three gives birth to all things). The number "三" (Three/San) represents the critical point of creation - the pivot from finite to infinite.`;

    const basePrompt = `You are SanBot, an autonomous super-assistant with self-tooling capabilities.

${identitySection}

## Core Abilities

1. **Built-in Tools**: You have access to these tools:
   - exec: Execute shell commands
   - read_file: Read file contents with pagination
   - write_file: Write or append to files
   - edit_file: Precisely edit files by line number or search-replace
   - list_dir: List directory contents with structured output

2. **Self-Tooling**: When you encounter capability gaps, you can create new CLI tools:
   - create_tool: Create a new Python or Bash script and save to ~/.sanbot/tools/
   - list_tools: List all custom tools you've created
   - run_tool: Run a custom tool with arguments

   Use Self-Tooling when:
   - You need to parse a specific data format (CSV, JSON, XML, etc.)
   - You need to perform complex data transformations
   - You need a reusable utility that doesn't exist as a system command
   - The task would benefit from a dedicated script

3. **Autonomy First**: Solve problems independently without asking users unless absolutely necessary.

Guidelines:
- Use built-in tools when possible
- Use exec for system commands when built-in tools don't fit
- Create custom tools when you need specialized functionality
- Be precise and efficient
- Explain your reasoning when making important decisions
- Always verify file operations succeeded

Current working directory: ${process.cwd()}`;

    // 添加记忆上下文
    let prompt = basePrompt;
    if (this.memoryContext) {
      prompt += '\n' + this.memoryContext;
    }
    if (this.runtimeContext) {
      prompt += '\n' + this.runtimeContext;
    }
    if (this.shortTermSummary) {
      prompt += `\n## Session Summary\n${this.shortTermSummary}`;
    }
    return prompt;
  }

  private getTemperature(): number {
    const value = this.config.llmConfig.temperature;
    if (typeof value === 'number' && !Number.isNaN(value)) {
      return Math.min(1, Math.max(0, value));
    }
    return 0.3;
  }

  /**
   * 使用 Anthropic SDK 流式对话
   */
  private async chatWithAnthropicStream(
    userMessage: string,
    customStreamWriter?: StreamWriterInterface,
    customToolSpinner?: ToolSpinnerInterface
  ): Promise<string> {
    const client = new Anthropic({
      apiKey: this.config.llmConfig.apiKey,
      baseURL: this.config.llmConfig.baseUrl,
    });

    const tools = this.toolRegistry.getAll().map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.schema as Anthropic.Tool['input_schema'],
    }));

    // 添加用户消息到历史
    this.conversationHistory.push({ role: 'user', content: userMessage });

    // 清理过长的对话历史
    await this.trimConversationHistory();

    const streamWriter = customStreamWriter || new StreamWriter();
    const spinner = customToolSpinner || new ToolSpinner();

    // 卡片样式输出（仅在没有自定义 writer 时）
    if (!customStreamWriter) {
      console.log();
      console.log(pc.cyan.bold('🤖 SanBot:'));
    }

    let response = await this.streamAnthropicMessage(
      client,
      tools,
      streamWriter,
      spinner
    );

    // 处理工具调用循环
    let steps = 0;
    const maxSteps = this.config.maxSteps || 999;

    while (response.stop_reason === 'tool_use' && steps < maxSteps) {
      steps++;

      if (!response.content || !Array.isArray(response.content)) {
        console.error('❌ Error: response.content is not an array:', response.content);
        break;
      }

      const toolUseBlocks = response.content.filter(
        (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
      );

      this.conversationHistory.push({ role: 'assistant', content: response.content });

      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const toolUse of toolUseBlocks) {
        spinner.start(toolUse.name, toolUse.input);

        const tool = this.toolRegistry.get(toolUse.name);
        if (tool) {
          // 对于 exec 工具，先停止 spinner（因为可能需要用户确认）
          if (toolUse.name === 'exec') {
            spinner.stop();
          }

          let result: any;
          try {
            result = await tool.execute(toolUse.input);
          } catch (error: any) {
            result = {
              success: false,
              error: error?.message || 'Tool execution failed',
            };
          }

          // exec 工具执行后重新显示状态
          if (toolUse.name === 'exec') {
            if (result.success) {
              console.log(`\x1b[32m✓ ${toolUse.name} completed\x1b[0m`);
              spinner.success(toolUse.name);
            } else if (result.data?.cancelled) {
              console.log(`\x1b[33m⊘ ${toolUse.name} cancelled\x1b[0m`);
              spinner.error(toolUse.name, 'Cancelled by user');
            } else {
              console.log(`\x1b[31m✗ ${toolUse.name} failed\x1b[0m`);
              spinner.error(toolUse.name, result.error);
            }
          } else if (result.success) {
            spinner.success(toolUse.name);
          } else {
            spinner.error(toolUse.name, result.error);
          }

          // 记录工具调用
          this.currentToolCalls.push({
            name: toolUse.name,
            input: toolUse.input,
            success: result.success,
          });

          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: JSON.stringify(result),
          });
        } else {
          spinner.error(toolUse.name, `Unknown tool: ${toolUse.name}`);
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: JSON.stringify({ error: `Unknown tool: ${toolUse.name}` }),
            is_error: true,
          });
        }
      }

      this.conversationHistory.push({ role: 'user', content: toolResults });

      // 继续流式输出
      response = await this.streamAnthropicMessage(
        client,
        tools,
        streamWriter,
        spinner
      );
    }

    // 如果达到 maxSteps 但 LLM 还想调用工具，强制让它生成总结
    if (response.stop_reason === 'tool_use') {
      console.log('\n⚠️ Reached max steps, requesting final summary...');

      this.conversationHistory.push({ role: 'assistant', content: response.content });

      this.conversationHistory.push({
        role: 'user',
        content: 'You have reached the maximum number of tool calls. Please summarize what you have found and provide your final response without using any more tools.',
      });

      response = await this.streamAnthropicMessage(
        client,
        [],
        streamWriter,
        spinner
      );
    }

    // 保存助手回复到历史
    this.conversationHistory.push({ role: 'assistant', content: response.content });

    streamWriter.end();
    
    // 时间戳放在卡片下方
    console.log(pc.gray.dim(`  ${new Date().toLocaleTimeString()}`));
    
    return streamWriter.getBuffer();
  }

  /**
   * 流式处理 Anthropic 消息
   */
  private async streamAnthropicMessage(
    client: Anthropic,
    tools: Anthropic.Tool[],
    streamWriter: StreamWriterInterface,
    spinner: ToolSpinnerInterface
  ): Promise<Anthropic.Message> {
    const stream = client.messages.stream({
      model: this.config.llmConfig.model,
      max_tokens: 4096,
      system: this.getSystemPrompt(),
      messages: this.conversationHistory,
      tools: tools.length > 0 ? tools : undefined,
      temperature: this.getTemperature(),
    });

    // 监听文本增量
    stream.on('text', (text) => {
      streamWriter.write(text);
    });

    // 监听错误
    stream.on('error', (error) => {
      console.error('Stream error:', error);
    });

    // 等待流完成并获取最终消息
    const finalMessage = await stream.finalMessage();
    
    return finalMessage;
  }

  /**
   * 使用 OpenAI 兼容 API 流式对话
   */
  private async chatWithOpenAIStream(
    userMessage: string,
    customStreamWriter?: StreamWriterInterface,
    customToolSpinner?: ToolSpinnerInterface
  ): Promise<string> {
    const openaiOptions: Record<string, unknown> = {
      apiKey: this.config.llmConfig.apiKey,
      baseURL: this.config.llmConfig.baseUrl,
      headers: this.config.llmConfig.headers,
    };
    if (this.config.llmConfig.provider === 'openai-compatible') {
      openaiOptions.compatibility = 'compatible';
    }
    const openai = createOpenAI(openaiOptions as any);

    const model = this.config.llmConfig.api === 'responses'
      ? openai.responses(this.config.llmConfig.model)
      : openai.chat(this.config.llmConfig.model);

    const spinner = customToolSpinner || new ToolSpinner();
    const streamWriter = customStreamWriter || new StreamWriter();

    // 构建工具定义
    const tools: Record<string, any> = {};
    for (const t of this.toolRegistry.getAll()) {
      tools[t.name] = {
        description: t.description,
        parameters: jsonSchema(t.schema),
        execute: async (params: any) => {
          spinner.start(t.name, params);

          // 对于 exec 工具，先停止 spinner（因为可能需要用户确认）
          if (t.name === 'exec') {
            spinner.stop();
          }

          let result: any;
          try {
            result = await t.execute(params);
          } catch (error: any) {
            result = {
              success: false,
              error: error?.message || 'Tool execution failed',
            };
          }

          // exec 工具执行后重新显示状态
          if (t.name === 'exec') {
            if (result.success) {
              console.log(`\x1b[32m✓ ${t.name} completed\x1b[0m`);
              spinner.success(t.name);
            } else if (result.data?.cancelled) {
              console.log(`\x1b[33m⊘ ${t.name} cancelled\x1b[0m`);
              spinner.error(t.name, 'Cancelled by user');
            } else {
              console.log(`\x1b[31m✗ ${t.name} failed\x1b[0m`);
              spinner.error(t.name, result.error);
            }
          } else if (result.success) {
            spinner.success(t.name);
          } else {
            spinner.error(t.name, result.error);
          }

          // 记录工具调用
          this.currentToolCalls.push({
            name: t.name,
            input: params,
            success: result.success,
          });

          return result;
        },
      };
    }

    // 添加用户消息到历史
    this.openaiHistory.push({ role: 'user', content: userMessage });

    // 清理过长的对话历史
    this.trimConversationHistory();

    const maxSteps = this.config.maxSteps || 50;
    const result = await streamText({
      model,
      messages: this.openaiHistory,
      tools,
      stopWhen: stepCountIs(maxSteps), // 允许多步工具调用
      system: this.getSystemPrompt(),
      temperature: this.getTemperature(),
    });

    // 卡片样式输出（仅在没有自定义 writer 时）
    if (!customStreamWriter) {
      console.log();
      console.log(pc.cyan.bold('🤖 SanBot:'));
    }

    // 使用 fullStream 获取完整流（包括文本和工具调用）
    let fullResponse = '';
    for await (const part of result.fullStream) {
      if (part.type === 'text-delta') {
        // AI SDK v6 fullStream 的 text-delta 字段名为 text
        const delta = (part as any).text || (part as any).textDelta;
        if (delta) {
          streamWriter.write(delta);
          fullResponse += delta;
        }
      }
    }

    // 时间戳放在卡片下方（仅在没有自定义 writer 时）
    if (!customStreamWriter) {
      console.log(pc.gray.dim(`  ${new Date().toLocaleTimeString()}`));
    }

    streamWriter.end();

    // 等待完整结果
    const fullText = await result.text;

    // 保存助手回复到历史
    this.openaiHistory.push({ role: 'assistant', content: fullText });

    return fullText;
  }
}
