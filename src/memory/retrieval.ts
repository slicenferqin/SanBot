/**
 * 记忆检索 - 在对话前加载相关记忆
 */

import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { SUMMARY_DIR, EXTRACTED_DIR, loadTodayConversations } from './storage.ts';
import type { MemorySummary, ConversationRecord } from './types.ts';

/**
 * 会话上下文
 */
export interface SessionContext {
  summary?: MemorySummary;
  todayConversations: ConversationRecord[];
  relevantMemories: string[];
  extracted?: Record<string, string[]>;
}

/**
 * 加载记忆摘要 (L2)
 */
export async function loadSummary(): Promise<MemorySummary | null> {
  const summaryPath = join(SUMMARY_DIR, 'master.md');

  if (!existsSync(summaryPath)) {
    return null;
  }

  // 简单解析 markdown 摘要
  const content = await readFile(summaryPath, 'utf-8');

  // 提取各部分
  const profileMatch = content.match(
    /## User Profile\n\n([\s\S]*?)(?=\n## |$)/
  );
  const preferencesMatch = content.match(
    /## Preferences\n\n([\s\S]*?)(?=\n## |$)/
  );
  const factsMatch = content.match(/## Key Facts\n\n([\s\S]*?)(?=\n## |$)/);
  const decisionsMatch = content.match(
    /## Recent Decisions\n\n([\s\S]*?)(?=\n## |$)/
  );

  const parseList = (text: string | undefined): string[] => {
    if (!text || text.includes('_No ')) return [];
    return text
      .split('\n')
      .filter((line) => line.startsWith('- '))
      .map((line) => line.slice(2).trim());
  };

  return {
    updatedAt: new Date().toISOString(),
    profile: profileMatch?.[1]?.trim() || '',
    preferences: parseList(preferencesMatch?.[1]),
    keyFacts: parseList(factsMatch?.[1]),
    recentDecisions: parseList(decisionsMatch?.[1]),
  };
}

/**
 * 加载 L1 记忆文件
 */
export async function loadExtractedMemories(
  category: string
): Promise<string[]> {
  const filePath = join(EXTRACTED_DIR, `${category}.md`);

  if (!existsSync(filePath)) {
    return [];
  }

  const content = await readFile(filePath, 'utf-8');
  return content
    .split('\n')
    .filter((line) => line.startsWith('- '))
    .map((line) => line.slice(2).trim());
}

/**
 * 获取会话上下文（用于注入到 system prompt）
 */
export async function getSessionContext(): Promise<SessionContext> {
  const [
    summary,
    todayConversations,
    runtimeMemories,
    decisionMemories,
    factMemories,
    preferenceMemories,
  ] = await Promise.all([
    loadSummary(),
    loadTodayConversations(),
    loadExtractedMemories('runtime'),
    loadExtractedMemories('decisions'),
    loadExtractedMemories('facts'),
    loadExtractedMemories('preferences'),
  ]);

  // 收集相关记忆
  const relevantMemories: string[] = [];

  if (summary) {
    if (summary.profile) {
      relevantMemories.push(`User Profile: ${summary.profile}`);
    }
    if (summary.preferences.length > 0) {
      relevantMemories.push(
        `User Preferences: ${summary.preferences.join('; ')}`
      );
    }
    if (summary.keyFacts.length > 0) {
      relevantMemories.push(`Key Facts: ${summary.keyFacts.slice(0, 5).join('; ')}`);
    }
  }

  // L1: compaction 产出的记忆
  if (decisionMemories.length > 0) {
    relevantMemories.push(
      ...decisionMemories.slice(-5).map((m) => `Decision: ${m}`)
    );
  }
  if (factMemories.length > 0) {
    relevantMemories.push(
      ...factMemories.slice(-5).map((m) => `Fact: ${m}`)
    );
  }
  if (preferenceMemories.length > 0) {
    relevantMemories.push(
      ...preferenceMemories.slice(-5).map((m) => `Preference: ${m}`)
    );
  }

  if (runtimeMemories.length > 0) {
    const latestRuntime = runtimeMemories.slice(-3);
    relevantMemories.push(...latestRuntime.map((memory) => `Runtime Insight: ${memory}`));
  }

  return {
    summary: summary || undefined,
    todayConversations,
    relevantMemories,
    extracted: {
      runtime: runtimeMemories.slice(-10),
      decisions: decisionMemories.slice(-10),
      facts: factMemories.slice(-10),
      preferences: preferenceMemories.slice(-10),
    },
  };
}

/**
 * 格式化记忆为 system prompt 片段
 */
export function formatMemoryContext(context: SessionContext): string {
  const sections: string[] = [];

  // L2: 长期记忆摘要
  if (context.relevantMemories.length > 0) {
    sections.push(`### Long-term Memory (L2)
${context.relevantMemories.map((m) => `- ${m}`).join('\n')}`);
  }

  // L1: 抽取记忆（compaction 产出）
  const l1Sections: string[] = [];
  if (context.extracted?.decisions?.length) {
    l1Sections.push(...context.extracted.decisions.slice(-5).map((d) => `- [Decision] ${d}`));
  }
  if (context.extracted?.facts?.length) {
    l1Sections.push(...context.extracted.facts.slice(-5).map((f) => `- [Fact] ${f}`));
  }
  if (context.extracted?.preferences?.length) {
    l1Sections.push(...context.extracted.preferences.slice(-5).map((p) => `- [Preference] ${p}`));
  }
  if (l1Sections.length > 0) {
    sections.push(`### Extracted Memory (L1)
${l1Sections.join('\n')}`);
  }

  // L0: 今日对话历史（短期记忆）
  if (context.todayConversations.length > 0) {
    // 只取最近 5 条，避免上下文过长
    const recentConversations = context.todayConversations.slice(-5);
    const conversationSummary = recentConversations
      .map((c) => {
        const time = new Date(c.timestamp).toLocaleTimeString('zh-CN', {
          hour: '2-digit',
          minute: '2-digit',
        });
        // 截断过长的内容
        const userMsg =
          c.userMessage.length > 100
            ? c.userMessage.slice(0, 100) + '...'
            : c.userMessage;
        const assistantMsg =
          c.assistantResponse.length > 150
            ? c.assistantResponse.slice(0, 150) + '...'
            : c.assistantResponse;
        return `[${time}] User: ${userMsg}\nAssistant: ${assistantMsg}`;
      })
      .join('\n\n');

    sections.push(`### Today's Conversations (L0 - Short-term Memory)
${conversationSummary}`);
  }

  if (sections.length === 0) {
    return '';
  }

  return `
## Memory Context

${sections.join('\n\n')}

Use this context to provide personalized and contextually relevant responses.
`;
}
