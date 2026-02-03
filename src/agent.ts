import Anthropic from '@anthropic-ai/sdk';
import { generateText, jsonSchema, streamText, type CoreMessage } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import type { Config } from './config/types.ts';
import { createToolRegistry, createToolRegistryWithDynamic, type ToolRegistry } from './tools/index.ts';
import {
  saveConversation,
  getSessionContext,
  formatMemoryContext,
  type ToolCallRecord,
} from './memory/index.ts';
import { loadSoul } from './birth/index.ts';
import { setSessionId } from './utils/confirmation.ts';
import { ToolSpinner, StreamWriter } from './tui/index.ts';

/**
 * Agent 配置
 */
export interface AgentConfig {
  llmConfig: Config['llm'];
  maxSteps?: number;
  sessionId?: string;
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
  private openaiHistory: CoreMessage[] = [];
  // 当前对话的工具调用记录
  private currentToolCalls: ToolCallRecord[] = [];
  // 记忆上下文
  private memoryContext: string = '';
  // 灵魂记录
  private soulContext: string = '';
  // 是否已初始化
  private initialized: boolean = false;

  constructor(config: AgentConfig) {
    this.config = config;
    this.sessionId =
      config.sessionId || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    // 设置全局会话 ID（用于审计日志）
    setSessionId(this.sessionId);
    // 先用同步版本，init 时会替换
    this.toolRegistry = createToolRegistry();
  }

  /**
   * 初始化 Agent（加载记忆和自创建工具）
   */
  async init(): Promise<void> {
    if (this.initialized) return;

    // 并行加载记忆、灵魂、自创建工具
    const [context, soul, registry] = await Promise.all([
      getSessionContext(),
      loadSoul(),
      createToolRegistryWithDynamic(),
    ]);

    this.memoryContext = formatMemoryContext(context);
    this.soulContext = soul || '';
    this.toolRegistry = registry;
    this.initialized = true;
  }

  /**
   * 初始化记忆上下文（兼容旧接口）
   * @deprecated 使用 init() 代替
   */
  async initMemory(): Promise<void> {
    await this.init();
  }

  /**
   * 清空对话历史
   */
  clearHistory(): void {
    this.conversationHistory = [];
    this.openaiHistory = [];
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
  async chatStream(userMessage: string): Promise<string> {
    // 重置当前工具调用记录
    this.currentToolCalls = [];

    const { provider } = this.config.llmConfig;

    let response: string;

    // Anthropic 使用原生 SDK（更好的兼容性）
    if (provider === 'anthropic') {
      response = await this.chatWithAnthropicStream(userMessage);
    } else {
      // OpenAI 兼容服务商使用 AI SDK
      response = await this.chatWithOpenAIStream(userMessage);
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
          const result = await tool.execute(toolUse.input);
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
    const openai = createOpenAI({
      apiKey: this.config.llmConfig.apiKey,
      baseURL: this.config.llmConfig.baseUrl,
      headers: this.config.llmConfig.headers,
      compatibility: 'compatible',
    });

    const model = openai.chat(this.config.llmConfig.model);

    // 构建工具定义
    const tools: Record<string, any> = {};
    for (const t of this.toolRegistry.getAll()) {
      tools[t.name] = {
        description: t.description,
        parameters: jsonSchema(t.schema),
        execute: async (params: any) => {
          console.log(`\n🔧 Calling tool: ${t.name}`);
          console.log(`   Input: ${JSON.stringify(params)}`);
          const result = await t.execute(params);
          console.log(`   Result: ${result.success ? '✅' : '❌'}`);
          return result;
        },
      };
    }

    // 添加用户消息到历史
    this.openaiHistory.push({ role: 'user', content: userMessage });

    const result = await generateText({
      model,
      messages: this.openaiHistory,
      tools,
      maxSteps: this.config.maxSteps || 999,
      system: this.getSystemPrompt(),
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
    if (this.memoryContext) {
      return basePrompt + '\n' + this.memoryContext;
    }

    return basePrompt;
  }

  /**
   * 使用 Anthropic SDK 流式对话
   */
  private async chatWithAnthropicStream(userMessage: string): Promise<string> {
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

    const streamWriter = new StreamWriter();
    const spinner = new ToolSpinner();

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
          const result = await tool.execute(toolUse.input);
          
          if (result.success) {
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
    return streamWriter.getBuffer();
  }

  /**
   * 流式处理 Anthropic 消息
   */
  private async streamAnthropicMessage(
    client: Anthropic,
    tools: Anthropic.Tool[],
    streamWriter: StreamWriter,
    spinner: ToolSpinner
  ): Promise<Anthropic.Message> {
    const stream = client.messages.stream({
      model: this.config.llmConfig.model,
      max_tokens: 4096,
      system: this.getSystemPrompt(),
      messages: this.conversationHistory,
      tools: tools.length > 0 ? tools : undefined,
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
  private async chatWithOpenAIStream(userMessage: string): Promise<string> {
    const openai = createOpenAI({
      apiKey: this.config.llmConfig.apiKey,
      baseURL: this.config.llmConfig.baseUrl,
      headers: this.config.llmConfig.headers,
      compatibility: 'compatible',
    });

    const model = openai.chat(this.config.llmConfig.model);

    const spinner = new ToolSpinner();
    const streamWriter = new StreamWriter();

    // 构建工具定义
    const tools: Record<string, any> = {};
    for (const t of this.toolRegistry.getAll()) {
      tools[t.name] = {
        description: t.description,
        parameters: jsonSchema(t.schema),
        execute: async (params: any) => {
          spinner.start(t.name, params);
          const result = await t.execute(params);
          
          if (result.success) {
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

    const result = await streamText({
      model,
      messages: this.openaiHistory,
      tools,
      maxSteps: this.config.maxSteps || 999,
      system: this.getSystemPrompt(),
    });

    // 流式输出文本
    for await (const chunk of result.textStream) {
      streamWriter.write(chunk);
    }

    streamWriter.end();

    // 等待完整结果
    const fullText = await result.text;

    // 保存助手回复到历史
    this.openaiHistory.push({ role: 'assistant', content: fullText });

    return fullText;
  }
}

