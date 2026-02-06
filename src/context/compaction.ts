/**
 * Context Compaction - 上下文压缩模块
 *
 * 负责在上下文接近溢出时自动压缩对话历史，
 * 同时保留关键信息并沉淀到记忆系统。
 */

import { existsSync } from 'fs';
import { mkdir, writeFile, appendFile } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';
import Anthropic from '@anthropic-ai/sdk';
import type { Config } from '../config/types.ts';
import { recordContextEvent } from './tracker.ts';

// 目录常量
const MEMORY_DIR = join(homedir(), '.sanbot', 'memory');
const SESSION_SUMMARY_DIR = join(MEMORY_DIR, 'session-summaries');
const EXTRACTED_DIR = join(MEMORY_DIR, 'extracted');

/**
 * Compaction 配置
 */
export interface CompactionConfig {
  /** 触发压缩的最大消息数 */
  maxMessages: number;
  /** 触发压缩的 token 占比（0-1） */
  maxTokenRatio: number;
  /** 触发压缩的工具输出字节数 */
  maxToolOutputBytes: number;
  /** 压缩后保留的最近消息数 */
  keepRecentMessages: number;
  /** 是否使用 LLM 生成摘要 */
  useLLMSummary: boolean;
  /** 摘要最大 token 数 */
  summaryMaxTokens: number;
  /** 快照保留天数 */
  snapshotRetentionDays: number;
}

/**
 * 默认配置
 */
export const DEFAULT_COMPACTION_CONFIG: CompactionConfig = {
  maxMessages: 80,
  maxTokenRatio: 0.8,
  maxToolOutputBytes: 50 * 1024,
  keepRecentMessages: 20,
  useLLMSummary: true,
  summaryMaxTokens: 500,
  snapshotRetentionDays: 7,
};

/**
 * 压缩结果
 */
export interface CompactionResult {
  /** 是否执行了压缩 */
  compacted: boolean;
  /** 压缩前消息数 */
  originalCount: number;
  /** 压缩后消息数 */
  newCount: number;
  /** 生成的摘要 */
  summary: string;
  /** 快照路径 */
  snapshotPath?: string;
  /** 抽取的关键信息 */
  extracted: ExtractedInfo;
}

/**
 * 抽取的关键信息
 */
export interface ExtractedInfo {
  decisions: string[];
  facts: string[];
  preferences: string[];
}

/**
 * 消息类型（兼容 Anthropic 和 OpenAI）
 */
export interface GenericMessage {
  role: string;
  content: any;
}

/**
 * Context Compactor - 上下文压缩器
 */
export class ContextCompactor {
  private config: CompactionConfig;
  private llmConfig: Config['llm'];

  constructor(llmConfig: Config['llm'], config?: Partial<CompactionConfig>) {
    this.llmConfig = llmConfig;
    this.config = { ...DEFAULT_COMPACTION_CONFIG, ...config };
  }

  /**
   * 检查是否需要压缩
   */
  shouldCompact(messages: GenericMessage[]): boolean {
    // 条件 1：消息数量超过阈值
    if (messages.length > this.config.maxMessages) {
      return true;
    }

    // 条件 2：工具输出累积过大
    const toolOutputSize = this.estimateToolOutputSize(messages);
    if (toolOutputSize > this.config.maxToolOutputBytes) {
      return true;
    }

    return false;
  }

  /**
   * 估算工具输出大小
   */
  private estimateToolOutputSize(messages: GenericMessage[]): number {
    let size = 0;
    for (const msg of messages) {
      if (msg.role === 'user' && Array.isArray(msg.content)) {
        for (const block of msg.content) {
          if (block.type === 'tool_result') {
            size += JSON.stringify(block.content || '').length;
          }
        }
      }
    }
    return size;
  }

  /**
   * 执行压缩
   */
  async compact(
    messages: GenericMessage[],
    sessionId: string
  ): Promise<CompactionResult> {
    const originalCount = messages.length;

    // 如果不需要压缩，直接返回
    if (!this.shouldCompact(messages)) {
      return {
        compacted: false,
        originalCount,
        newCount: originalCount,
        summary: '',
        extracted: { decisions: [], facts: [], preferences: [] },
      };
    }

    console.log(`\n📦 Compacting context: ${originalCount} messages...`);

    // 1. 保存快照
    const snapshotPath = await this.saveSnapshot(messages, sessionId);

    // 2. 分离要压缩的消息和要保留的消息
    const keepCount = this.config.keepRecentMessages;
    const toCompress = messages.slice(0, -keepCount);
    const toKeep = messages.slice(-keepCount);

    // 3. 生成摘要
    const summary = await this.generateSummary(toCompress);

    // 4. 抽取关键信息
    const extracted = await this.extractKeyInfo(toCompress);

    // 5. 保存抽取的信息到 L1
    await this.saveExtractedInfo(extracted);

    // 6. 保存会话摘要
    await this.saveSessionSummary(sessionId, summary);

    // 7. 记录审计事件
    await recordContextEvent({
      source: 'compaction',
      summary: `Compacted ${toCompress.length} messages, kept ${toKeep.length}`,
      detail: JSON.stringify({
        originalCount,
        compressedCount: toCompress.length,
        keptCount: toKeep.length,
        snapshotPath,
      }),
    });

    console.log(`✅ Compaction complete: ${originalCount} → ${toKeep.length} messages`);

    return {
      compacted: true,
      originalCount,
      newCount: toKeep.length,
      summary,
      snapshotPath,
      extracted,
    };
  }

  /**
   * 保存快照
   */
  private async saveSnapshot(
    messages: GenericMessage[],
    sessionId: string
  ): Promise<string> {
    await this.ensureDirs();

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const snapshotPath = join(
      SESSION_SUMMARY_DIR,
      `${sessionId}-${timestamp}.jsonl`
    );

    // 写入消息快照
    const content = messages.map((m) => JSON.stringify(m)).join('\n');
    await writeFile(snapshotPath, content, 'utf-8');

    // 写入元信息
    const metaPath = snapshotPath.replace('.jsonl', '.meta.json');
    await writeFile(
      metaPath,
      JSON.stringify({
        sessionId,
        timestamp: new Date().toISOString(),
        messageCount: messages.length,
        toolOutputSize: this.estimateToolOutputSize(messages),
      }),
      'utf-8'
    );

    return snapshotPath;
  }

  /**
   * 生成摘要
   */
  private async generateSummary(messages: GenericMessage[]): Promise<string> {
    if (messages.length === 0) {
      return '';
    }

    if (this.config.useLLMSummary) {
      return this.generateLLMSummary(messages);
    } else {
      return this.generateRuleSummary(messages);
    }
  }

  /**
   * 使用 LLM 生成摘要
   */
  private async generateLLMSummary(messages: GenericMessage[]): Promise<string> {
    const conversationText = this.formatMessagesForSummary(messages);

    const prompt = `请将以下对话历史压缩为简洁摘要，保留：
1. 用户的核心意图和目标
2. 已完成的关键步骤
3. 重要的决策和结论
4. 待处理的事项

对话历史：
${conversationText}

输出格式（使用 Markdown）：
## 任务目标
[一句话描述]

## 已完成
- [步骤1]
- [步骤2]

## 关键决策
- [决策1]

## 待处理
- [事项1]

请直接输出摘要，不要包含其他说明：`;

    try {
      const client = new Anthropic({
        apiKey: this.llmConfig.apiKey,
        baseURL: this.llmConfig.baseUrl,
      });

      const response = await client.messages.create({
        model: this.llmConfig.model,
        max_tokens: this.config.summaryMaxTokens,
        messages: [{ role: 'user', content: prompt }],
      });

      const textBlock = response.content.find(
        (block): block is Anthropic.TextBlock => block.type === 'text'
      );

      return textBlock?.text || this.generateRuleSummary(messages);
    } catch (error) {
      console.warn('LLM summary failed, falling back to rule-based:', error);
      return this.generateRuleSummary(messages);
    }
  }

  /**
   * 使用规则生成摘要（备选方案）
   */
  private generateRuleSummary(messages: GenericMessage[]): string {
    const userMessages = messages.filter((m) => m.role === 'user');
    const assistantMessages = messages.filter((m) => m.role === 'assistant');
    const toolCalls = this.extractToolCalls(messages);

    const recentTopics = userMessages
      .slice(-3)
      .map((m) => this.extractTextContent(m.content).slice(0, 80))
      .filter(Boolean);

    const uniqueTools = [...new Set(toolCalls.map((t) => t.name))];

    return `## 会话摘要（自动生成）

- 用户消息数：${userMessages.length}
- 助手回复数：${assistantMessages.length}
- 工具调用数：${toolCalls.length}

### 最近话题
${recentTopics.map((t) => `- ${t}`).join('\n') || '- 无'}

### 使用的工具
${uniqueTools.join(', ') || '无'}
`;
  }

  /**
   * 抽取关键信息
   */
  private async extractKeyInfo(
    messages: GenericMessage[]
  ): Promise<ExtractedInfo> {
    const result: ExtractedInfo = {
      decisions: [],
      facts: [],
      preferences: [],
    };

    // 简单的关键词匹配抽取
    for (const msg of messages) {
      const text = this.extractTextContent(msg.content);
      if (!text) continue;

      // 决策关键词
      if (/决定|选择|确定|采用|使用/.test(text)) {
        const sentences = text.split(/[。！？\n]/).filter(Boolean);
        for (const s of sentences) {
          if (/决定|选择|确定|采用|使用/.test(s) && s.length < 200) {
            result.decisions.push(s.trim());
          }
        }
      }

      // 事实关键词（路径、配置、名称）
      if (/路径|配置|项目|文件|目录|API|URL/.test(text)) {
        const sentences = text.split(/[。！？\n]/).filter(Boolean);
        for (const s of sentences) {
          if (/路径|配置|项目|文件|目录|API|URL/.test(s) && s.length < 200) {
            result.facts.push(s.trim());
          }
        }
      }

      // 偏好关键词
      if (/喜欢|偏好|习惯|倾向|prefer/.test(text)) {
        const sentences = text.split(/[。！？\n]/).filter(Boolean);
        for (const s of sentences) {
          if (/喜欢|偏好|习惯|倾向|prefer/.test(s) && s.length < 200) {
            result.preferences.push(s.trim());
          }
        }
      }
    }

    // 去重
    result.decisions = [...new Set(result.decisions)].slice(0, 10);
    result.facts = [...new Set(result.facts)].slice(0, 10);
    result.preferences = [...new Set(result.preferences)].slice(0, 10);

    return result;
  }

  /**
   * 保存抽取的信息到 L1
   */
  private async saveExtractedInfo(info: ExtractedInfo): Promise<void> {
    await this.ensureDirs();
    const timestamp = new Date().toISOString();

    // 保存决策
    if (info.decisions.length > 0) {
      const decisionsPath = join(EXTRACTED_DIR, 'decisions.md');
      const content = info.decisions
        .map((d) => `- [${timestamp}] ${d}`)
        .join('\n') + '\n';
      await appendFile(decisionsPath, content, 'utf-8');
    }

    // 保存事实
    if (info.facts.length > 0) {
      const factsPath = join(EXTRACTED_DIR, 'facts.md');
      const content = info.facts
        .map((f) => `- [${timestamp}] ${f}`)
        .join('\n') + '\n';
      await appendFile(factsPath, content, 'utf-8');
    }

    // 保存偏好
    if (info.preferences.length > 0) {
      const prefsPath = join(EXTRACTED_DIR, 'preferences.md');
      const content = info.preferences
        .map((p) => `- [${timestamp}] ${p}`)
        .join('\n') + '\n';
      await appendFile(prefsPath, content, 'utf-8');
    }

    // 保存运行时摘要
    const runtimePath = join(EXTRACTED_DIR, 'runtime.md');
    const runtimeContent = `\n## Compaction at ${timestamp}\n- Decisions: ${info.decisions.length}\n- Facts: ${info.facts.length}\n- Preferences: ${info.preferences.length}\n`;
    await appendFile(runtimePath, runtimeContent, 'utf-8');
  }

  /**
   * 保存会话摘要
   */
  private async saveSessionSummary(
    sessionId: string,
    summary: string
  ): Promise<void> {
    if (!summary) return;

    await this.ensureDirs();
    const summaryPath = join(SESSION_SUMMARY_DIR, `${sessionId}.md`);
    const timestamp = new Date().toISOString();
    const content = `\n---\n## ${timestamp}\n\n${summary}\n`;
    await appendFile(summaryPath, content, 'utf-8');
  }

  /**
   * 格式化消息用于摘要
   */
  private formatMessagesForSummary(messages: GenericMessage[]): string {
    const formatted: string[] = [];

    for (const msg of messages) {
      const text = this.extractTextContent(msg.content);
      if (text) {
        // 截断过长的内容
        const truncated = text.length > 500 ? text.slice(0, 500) + '...' : text;
        formatted.push(`[${msg.role}] ${truncated}`);
      }
    }

    // 限制总长度
    const joined = formatted.join('\n\n');
    return joined.length > 8000 ? joined.slice(0, 8000) + '\n...(truncated)' : joined;
  }

  /**
   * 提取文本内容
   */
  private extractTextContent(content: any): string {
    if (!content) return '';

    if (typeof content === 'string') {
      return content;
    }

    if (Array.isArray(content)) {
      return content
        .map((block) => {
          if (typeof block === 'string') return block;
          if (block?.type === 'text') return block.text || '';
          if (block?.type === 'tool_use') return `[Tool: ${block.name}]`;
          if (block?.type === 'tool_result') {
            const resultText = typeof block.content === 'string'
              ? block.content
              : JSON.stringify(block.content);
            return `[Result: ${resultText.slice(0, 100)}...]`;
          }
          return '';
        })
        .filter(Boolean)
        .join(' ');
    }

    return '';
  }

  /**
   * 提取工具调用
   */
  private extractToolCalls(
    messages: GenericMessage[]
  ): Array<{ name: string; input: any }> {
    const calls: Array<{ name: string; input: any }> = [];

    for (const msg of messages) {
      if (msg.role === 'assistant' && Array.isArray(msg.content)) {
        for (const block of msg.content) {
          if (block?.type === 'tool_use') {
            calls.push({ name: block.name, input: block.input });
          }
        }
      }
    }

    return calls;
  }

  /**
   * 确保目录存在
   */
  private async ensureDirs(): Promise<void> {
    for (const dir of [SESSION_SUMMARY_DIR, EXTRACTED_DIR]) {
      if (!existsSync(dir)) {
        await mkdir(dir, { recursive: true });
      }
    }
  }
}
