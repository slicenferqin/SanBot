import Anthropic from '@anthropic-ai/sdk';
import { generateText, jsonSchema, type CoreMessage } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import type { Config } from './config/types.ts';
import { createToolRegistry } from './tools/index.ts';

/**
 * Agent 配置
 */
export interface AgentConfig {
  llmConfig: Config['llm'];
  maxSteps?: number;
}

/**
 * Agent 核心类 - 支持多服务商
 */
export class Agent {
  private toolRegistry;
  private config: AgentConfig;
  // 对话历史 - 支持多轮对话
  private conversationHistory: Anthropic.MessageParam[] = [];
  private openaiHistory: CoreMessage[] = [];

  constructor(config: AgentConfig) {
    this.config = config;
    this.toolRegistry = createToolRegistry();
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
    const { provider } = this.config.llmConfig;

    // Anthropic 使用原生 SDK（更好的兼容性）
    if (provider === 'anthropic') {
      return this.chatWithAnthropic(userMessage);
    }

    // OpenAI 兼容服务商使用 AI SDK
    return this.chatWithOpenAI(userMessage);
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
    const maxSteps = this.config.maxSteps || 10;

    while (response.stop_reason === 'tool_use' && steps < maxSteps) {
      steps++;

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
      maxSteps: this.config.maxSteps || 10,
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
    return `You are SanBot, an autonomous super-assistant with self-tooling capabilities.

Your core abilities:
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
  }
}
