/**
 * 记忆整理器 - 负责 L0 → L1 → L2 的抽取和整理
 */

import { existsSync } from 'fs';
import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import Anthropic from '@anthropic-ai/sdk';
import type { Config } from '../config/types.ts';
import type {
  ConversationRecord,
  ExtractedMemory,
  MemoryCategory,
  MemorySummary,
} from './types.ts';
import {
  EXTRACTED_DIR,
  SUMMARY_DIR,
  listDailyDates,
  loadDailyConversations,
} from './storage.ts';

/**
 * 记忆整理器
 */
export class MemoryConsolidator {
  private llmConfig: Config['llm'];

  constructor(llmConfig: Config['llm']) {
    this.llmConfig = llmConfig;
  }

  /**
   * 整理指定日期的对话 (L0 → L1)
   */
  async extractFromDaily(date: string): Promise<ExtractedMemory[]> {
    const conversations = await loadDailyConversations(date);

    if (conversations.length === 0) {
      console.log(`No conversations found for ${date}`);
      return [];
    }

    console.log(
      `Extracting memories from ${conversations.length} conversations on ${date}...`
    );

    // 构建对话文本
    const conversationText = conversations
      .map(
        (c) =>
          `[${c.timestamp}]\nUser: ${c.userMessage}\nAssistant: ${c.assistantResponse}`
      )
      .join('\n\n---\n\n');

    // 调用 LLM 抽取
    const extracted = await this.callLLMForExtraction(
      conversationText,
      conversations
    );

    // 保存到 L1 文件
    await this.saveExtractedMemories(extracted);

    return extracted;
  }

  /**
   * 调用 LLM 进行记忆抽取
   */
  private async callLLMForExtraction(
    conversationText: string,
    conversations: ConversationRecord[]
  ): Promise<ExtractedMemory[]> {
    const client = new Anthropic({
      apiKey: this.llmConfig.apiKey,
      baseURL: this.llmConfig.baseUrl,
    });

    const prompt = `分析以下对话，提取重要信息。请以 JSON 数组格式返回，每个条目包含：
- category: "preference" | "fact" | "decision" | "profile"
- content: 提取的内容（简洁明了）
- confidence: 0-1 的置信度

分类说明：
- preference: 用户的偏好、习惯、喜好（如：喜欢用 TypeScript、偏好简洁代码）
- fact: 重要的事实信息（如：项目名称、技术栈、API 地址）
- decision: 做出的决策（如：选择了某个方案、确定了某个设计）
- profile: 用户身份相关（如：职业、技能、工作内容）

只提取真正重要的信息，忽略临时性的、无意义的内容。如果没有值得提取的内容，返回空数组 []。

对话内容：
${conversationText}

请直接返回 JSON 数组，不要包含其他文字：`;

    const response = await client.messages.create({
      model: this.llmConfig.model,
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }],
    });

    const text =
      response.content[0].type === 'text' ? response.content[0].text : '';

    try {
      // 尝试解析 JSON
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        return [];
      }

      const parsed = JSON.parse(jsonMatch[0]) as Array<{
        category: MemoryCategory;
        content: string;
        confidence: number;
      }>;

      // 转换为 ExtractedMemory 格式
      return parsed.map((item) => ({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        timestamp: new Date().toISOString(),
        category: item.category,
        content: item.content,
        sourceConversationId: conversations[0]?.id || 'unknown',
        confidence: item.confidence,
      }));
    } catch (error) {
      console.error('Failed to parse extraction result:', error);
      return [];
    }
  }

  /**
   * 保存抽取的记忆到 L1 文件
   */
  private async saveExtractedMemories(
    memories: ExtractedMemory[]
  ): Promise<void> {
    const categories: MemoryCategory[] = [
      'preference',
      'fact',
      'decision',
      'profile',
    ];

    for (const category of categories) {
      const items = memories.filter((m) => m.category === category);
      if (items.length === 0) continue;

      const filePath = join(EXTRACTED_DIR, `${category}s.md`);
      let content = '';

      // 读取现有内容
      if (existsSync(filePath)) {
        content = await readFile(filePath, 'utf-8');
      } else {
        content = `# ${this.getCategoryTitle(category)}\n\n`;
      }

      // 追加新条目
      for (const item of items) {
        const date = item.timestamp.split('T')[0];
        content += `- [${date}] ${item.content}\n`;
      }

      await writeFile(filePath, content, 'utf-8');
    }
  }

  /**
   * 获取分类标题
   */
  private getCategoryTitle(category: MemoryCategory): string {
    const titles: Record<MemoryCategory, string> = {
      preference: 'User Preferences',
      fact: 'Key Facts',
      decision: 'Decisions',
      profile: 'User Profile',
    };
    return titles[category];
  }

  /**
   * 整理 L1 → L2 摘要
   */
  async consolidateToSummary(): Promise<MemorySummary> {
    console.log('Consolidating L1 → L2 summary...');

    // 读取所有 L1 文件
    const l1Contents: Record<string, string> = {};
    const categories = ['preferences', 'facts', 'decisions', 'profiles'];

    for (const cat of categories) {
      const filePath = join(EXTRACTED_DIR, `${cat}.md`);
      if (existsSync(filePath)) {
        l1Contents[cat] = await readFile(filePath, 'utf-8');
      }
    }

    // 调用 LLM 生成摘要
    const summary = await this.callLLMForSummary(l1Contents);

    // 保存到 L2
    const summaryPath = join(SUMMARY_DIR, 'master.md');
    const summaryContent = this.formatSummaryMarkdown(summary);
    await writeFile(summaryPath, summaryContent, 'utf-8');

    return summary;
  }

  /**
   * 调用 LLM 生成摘要
   */
  private async callLLMForSummary(
    l1Contents: Record<string, string>
  ): Promise<MemorySummary> {
    const client = new Anthropic({
      apiKey: this.llmConfig.apiKey,
      baseURL: this.llmConfig.baseUrl,
    });

    const prompt = `基于以下记忆条目，生成一份综合摘要。请以 JSON 格式返回：

{
  "profile": "用户画像的一段话描述",
  "preferences": ["偏好1", "偏好2", ...],
  "keyFacts": ["事实1", "事实2", ...],
  "recentDecisions": ["决策1", "决策2", ...]
}

要求：
1. 去重合并相似内容
2. 保留最重要的信息
3. 用简洁的语言

记忆条目：
${Object.entries(l1Contents)
  .map(([k, v]) => `## ${k}\n${v}`)
  .join('\n\n')}

请直接返回 JSON，不要包含其他文字：`;

    const response = await client.messages.create({
      model: this.llmConfig.model,
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }],
    });

    const text =
      response.content[0].type === 'text' ? response.content[0].text : '';

    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return this.getEmptySummary();
      }

      const parsed = JSON.parse(jsonMatch[0]);
      return {
        updatedAt: new Date().toISOString(),
        profile: parsed.profile || '',
        preferences: parsed.preferences || [],
        keyFacts: parsed.keyFacts || [],
        recentDecisions: parsed.recentDecisions || [],
      };
    } catch (error) {
      console.error('Failed to parse summary result:', error);
      return this.getEmptySummary();
    }
  }

  /**
   * 获取空摘要
   */
  private getEmptySummary(): MemorySummary {
    return {
      updatedAt: new Date().toISOString(),
      profile: '',
      preferences: [],
      keyFacts: [],
      recentDecisions: [],
    };
  }

  /**
   * 格式化摘要为 Markdown
   */
  private formatSummaryMarkdown(summary: MemorySummary): string {
    return `# Memory Summary

> Last updated: ${summary.updatedAt}

## User Profile

${summary.profile || '_No profile yet_'}

## Preferences

${summary.preferences.length > 0 ? summary.preferences.map((p) => `- ${p}`).join('\n') : '_No preferences recorded_'}

## Key Facts

${summary.keyFacts.length > 0 ? summary.keyFacts.map((f) => `- ${f}`).join('\n') : '_No facts recorded_'}

## Recent Decisions

${summary.recentDecisions.length > 0 ? summary.recentDecisions.map((d) => `- ${d}`).join('\n') : '_No decisions recorded_'}
`;
  }

  /**
   * 执行完整的整理流程
   */
  async runFullConsolidation(): Promise<void> {
    console.log('Starting memory consolidation...\n');

    // 获取所有待处理的日期
    const dates = await listDailyDates();

    if (dates.length === 0) {
      console.log('No daily logs found.');
      return;
    }

    // L0 → L1: 抽取每天的记忆
    let totalExtracted = 0;
    for (const date of dates) {
      const extracted = await this.extractFromDaily(date);
      totalExtracted += extracted.length;
      console.log(`  ${date}: extracted ${extracted.length} memories`);
    }

    console.log(`\nTotal extracted: ${totalExtracted} memories`);

    // L1 → L2: 生成摘要
    if (totalExtracted > 0) {
      await this.consolidateToSummary();
      console.log('Summary updated.');
    }

    console.log('\nConsolidation complete!');
  }
}
