/**
 * Subagent - 子代理模块
 *
 * 将高噪音/高体量/高独立性任务外包给子代理执行，
 * 子代理在独立上下文中工作，只回传结构化摘要。
 *
 * 适用场景：
 * - 大规模代码/日志检索
 * - 多来源资料并行研究
 * - 重型测试与报告归纳
 *
 * 不适用场景：
 * - 需要连续对话细调的创作类任务
 * - 强依赖主上下文细粒度历史的任务
 */

import Anthropic from '@anthropic-ai/sdk';
import type { Config } from '../config/types.ts';

/**
 * 子代理任务定义
 */
export interface SubagentTask {
  /** 任务 ID */
  id: string;
  /** 任务描述 */
  description: string;
  /** 任务类型 */
  type: 'search' | 'analyze' | 'verify' | 'summarize';
  /** 传入的上下文（精简后的） */
  context: string;
  /** 可用工具名称列表（最小权限） */
  allowedTools?: string[];
}

/**
 * 子代理执行结果（结构化摘要）
 */
export interface SubagentResult {
  /** 任务 ID */
  taskId: string;
  /** 是否成功 */
  success: boolean;
  /** 结构化摘要 */
  summary: string;
  /** 关键发现 */
  findings: string[];
  /** 置信度 0-1 */
  confidence: number;
  /** 建议的后续动作 */
  nextActions?: string[];
  /** 执行耗时（ms） */
  durationMs: number;
  /** 使用的 token 数 */
  tokensUsed?: number;
}

/**
 * SubagentRunner - 子代理执行器
 */
export class SubagentRunner {
  private llmConfig: Config['llm'];
  private maxSummaryTokens: number;

  constructor(llmConfig: Config['llm'], maxSummaryTokens: number = 800) {
    this.llmConfig = llmConfig;
    this.maxSummaryTokens = maxSummaryTokens;
  }

  /**
   * 执行单个子代理任务
   */
  async run(task: SubagentTask): Promise<SubagentResult> {
    const startTime = Date.now();

    try {
      const rawOutput = await this.executeTask(task);
      const summary = await this.summarizeOutput(task, rawOutput);
      return {
        ...summary,
        taskId: task.id,
        success: true,
        durationMs: Date.now() - startTime,
      };
    } catch (error: any) {
      return {
        taskId: task.id,
        success: false,
        summary: `Task failed: ${error?.message || 'Unknown error'}`,
        findings: [],
        confidence: 0,
        durationMs: Date.now() - startTime,
      };
    }
  }

  /**
   * 并行执行多个子代理任务
   */
  async runParallel(tasks: SubagentTask[]): Promise<SubagentResult[]> {
    return Promise.all(tasks.map((task) => this.run(task)));
  }

  /**
   * 执行任务并获取原始输出
   */
  private async executeTask(task: SubagentTask): Promise<string> {
    const client = new Anthropic({
      apiKey: this.llmConfig.apiKey,
      baseURL: this.llmConfig.baseUrl,
    });

    const systemPrompt = this.buildSubagentSystemPrompt(task);

    const response = await client.messages.create({
      model: this.llmConfig.model,
      max_tokens: 4096,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: `Execute the following task:\n\n${task.description}\n\nContext:\n${task.context}`,
        },
      ],
    });

    const textBlock = response.content.find(
      (block): block is Anthropic.TextBlock => block.type === 'text'
    );

    return textBlock?.text || '';
  }

  /**
   * 将原始输出压缩为结构化摘要
   */
  private async summarizeOutput(
    task: SubagentTask,
    rawOutput: string
  ): Promise<Omit<SubagentResult, 'taskId' | 'success' | 'durationMs'>> {
    // 如果输出已经很短，直接解析
    if (rawOutput.length < 500) {
      return this.parseStructuredOutput(rawOutput);
    }

    const client = new Anthropic({
      apiKey: this.llmConfig.apiKey,
      baseURL: this.llmConfig.baseUrl,
    });

    const prompt = `将以下子代理的执行结果压缩为结构化摘要。

任务：${task.description}
类型：${task.type}

原始输出：
${rawOutput.slice(0, 6000)}${rawOutput.length > 6000 ? '\n...(truncated)' : ''}

请以 JSON 格式返回：
{
  "summary": "一段话概括结果",
  "findings": ["关键发现1", "关键发现2"],
  "confidence": 0.0-1.0,
  "nextActions": ["建议动作1"]
}

直接返回 JSON：`;

    const response = await client.messages.create({
      model: this.llmConfig.model,
      max_tokens: this.maxSummaryTokens,
      messages: [{ role: 'user', content: prompt }],
    });

    const textBlock = response.content.find(
      (block): block is Anthropic.TextBlock => block.type === 'text'
    );

    return this.parseStructuredOutput(textBlock?.text || rawOutput);
  }

  /**
   * 解析结构化输出
   */
  private parseStructuredOutput(
    text: string
  ): Omit<SubagentResult, 'taskId' | 'success' | 'durationMs'> {
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          summary: parsed.summary || text.slice(0, 300),
          findings: Array.isArray(parsed.findings) ? parsed.findings : [],
          confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
          nextActions: Array.isArray(parsed.nextActions) ? parsed.nextActions : undefined,
        };
      }
    } catch {
      // JSON 解析失败，降级处理
    }

    return {
      summary: text.slice(0, 300),
      findings: [],
      confidence: 0.5,
    };
  }

  /**
   * 构建子代理系统提示
   */
  private buildSubagentSystemPrompt(task: SubagentTask): string {
    const typeInstructions: Record<SubagentTask['type'], string> = {
      search: '你是一个搜索代理。在给定的上下文中查找相关信息，返回精确的匹配结果。',
      analyze: '你是一个分析代理。深入分析给定的内容，提取关键洞察和模式。',
      verify: '你是一个验证代理。检查给定的内容是否正确、完整、一致。报告任何问题。',
      summarize: '你是一个摘要代理。将大量信息压缩为简洁、结构化的摘要。',
    };

    return `${typeInstructions[task.type]}

重要规则：
1. 只处理分配给你的任务，不要扩展范围
2. 输出必须简洁，聚焦关键信息
3. 如果信息不足以完成任务，明确说明缺少什么
4. 置信度要诚实：不确定就标低
${task.allowedTools?.length ? `5. 你只能使用以下工具：${task.allowedTools.join(', ')}` : ''}`;
  }

  /**
   * 将多个子代理结果合并为主代理可用的摘要
   */
  static mergeResults(results: SubagentResult[]): string {
    if (results.length === 0) return '';

    const sections: string[] = [];

    for (const result of results) {
      const status = result.success ? '✓' : '✗';
      const confidence = Math.round(result.confidence * 100);

      let section = `### [${status}] Task ${result.taskId} (${confidence}% confidence)\n`;
      section += result.summary;

      if (result.findings.length > 0) {
        section += '\n\nFindings:\n' + result.findings.map((f) => `- ${f}`).join('\n');
      }

      if (result.nextActions?.length) {
        section += '\n\nSuggested:\n' + result.nextActions.map((a) => `- ${a}`).join('\n');
      }

      sections.push(section);
    }

    return `## Subagent Results\n\n${sections.join('\n\n---\n\n')}`;
  }
}
