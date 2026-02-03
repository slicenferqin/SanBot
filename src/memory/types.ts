/**
 * 记忆系统类型定义
 */

/**
 * 单条对话记录 (L0)
 */
export interface ConversationRecord {
  id: string;
  timestamp: string; // ISO 8601
  sessionId: string;
  userMessage: string;
  assistantResponse: string;
  toolCalls?: ToolCallRecord[];
}

/**
 * 工具调用记录
 */
export interface ToolCallRecord {
  name: string;
  input: any;
  success: boolean;
}

/**
 * 抽取的记忆条目 (L1)
 */
export interface ExtractedMemory {
  id: string;
  timestamp: string;
  category: MemoryCategory;
  content: string;
  sourceConversationId: string;
  confidence?: number;
}

/**
 * 记忆分类
 */
export type MemoryCategory =
  | 'preference' // 用户偏好
  | 'fact' // 重要事实
  | 'decision' // 决策记录
  | 'profile'; // 用户画像

/**
 * 记忆摘要 (L2)
 */
export interface MemorySummary {
  updatedAt: string;
  profile: string;
  preferences: string[];
  keyFacts: string[];
  recentDecisions: string[];
}

/**
 * 整理任务状态
 */
export interface ConsolidationStatus {
  lastRun?: string;
  processedDays: string[];
  pendingDays: string[];
}
