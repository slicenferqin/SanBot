/**
 * Eval 框架 - 评测类型定义
 *
 * 把 agent 开发从"调感觉"变成"调系统"
 */

/**
 * 评测用例
 */
export interface EvalCase {
  /** 用例 ID */
  id: string;
  /** 用例名称 */
  name: string;
  /** 难度级别 */
  level: 'L1' | 'L2' | 'L3';
  /** 分类标签 */
  tags: string[];
  /** 用户输入 */
  input: string;
  /** 期望的工具调用（可选） */
  expectedTools?: string[];
  /** 验证器配置 */
  verifier: VerifierConfig;
  /** 超时时间（ms） */
  timeout?: number;
  /** 是否为 holdout 集 */
  isHoldout?: boolean;
}

/**
 * 验证器配置
 */
export type VerifierConfig =
  | ExactMatchVerifier
  | ContainsVerifier
  | SchemaVerifier
  | CustomVerifier
  | LLMVerifier;

/**
 * 精确匹配验证器
 */
export interface ExactMatchVerifier {
  type: 'exact_match';
  expected: string;
}

/**
 * 包含验证器
 */
export interface ContainsVerifier {
  type: 'contains';
  /** 必须包含的内容 */
  mustContain: string[];
  /** 不能包含的内容 */
  mustNotContain?: string[];
}

/**
 * Schema 验证器
 */
export interface SchemaVerifier {
  type: 'schema';
  /** JSON Schema */
  schema: Record<string, any>;
}

/**
 * 自定义验证器
 */
export interface CustomVerifier {
  type: 'custom';
  /** 验证函数名称 */
  fn: string;
}

/**
 * LLM 验证器（用于软性指标）
 */
export interface LLMVerifier {
  type: 'llm';
  /** 评判标准 */
  criteria: string;
  /** 评分阈值 (0-1) */
  threshold: number;
}

/**
 * 评测结果
 */
export interface EvalResult {
  /** 用例 ID */
  caseId: string;
  /** 是否通过 */
  passed: boolean;
  /** Agent 输出 */
  output: string;
  /** 工具调用记录 */
  toolCalls: ToolCallRecord[];
  /** 验证详情 */
  verification: VerificationResult;
  /** 执行指标 */
  metrics: EvalMetrics;
  /** 失败归因（如果失败） */
  failureAttribution?: FailureAttribution;
}

/**
 * 工具调用记录
 */
export interface ToolCallRecord {
  name: string;
  input: any;
  output: any;
  success: boolean;
  durationMs: number;
}

/**
 * 验证结果
 */
export interface VerificationResult {
  passed: boolean;
  reason: string;
  details?: any;
}

/**
 * 执行指标
 */
export interface EvalMetrics {
  /** 总耗时（ms） */
  totalDurationMs: number;
  /** 工具调用次数 */
  toolCallCount: number;
  /** 工具调用成功率 */
  toolSuccessRate: number;
  /** 估算 token 数 */
  estimatedTokens: number;
  /** LLM 调用次数 */
  llmCallCount: number;
}

/**
 * 失败归因
 */
export interface FailureAttribution {
  /** 失败类型 */
  type: 'context' | 'tool' | 'reasoning' | 'verification';
  /** 失败描述 */
  description: string;
  /** 改进建议 */
  suggestion: string;
}

/**
 * 评测报告
 */
export interface EvalReport {
  /** 报告 ID */
  id: string;
  /** 生成时间 */
  timestamp: string;
  /** 评测集名称 */
  evalSetName: string;
  /** 总体指标 */
  summary: EvalSummary;
  /** 按级别统计 */
  byLevel: Record<string, LevelStats>;
  /** 按标签统计 */
  byTag: Record<string, number>;
  /** 详细结果 */
  results: EvalResult[];
  /** 失败分析 */
  failureAnalysis: FailureAnalysis;
}

/**
 * 总体指标
 */
export interface EvalSummary {
  /** 总用例数 */
  totalCases: number;
  /** 通过数 */
  passedCases: number;
  /** 成功率 */
  successRate: number;
  /** 平均耗时 */
  avgDurationMs: number;
  /** 平均工具调用数 */
  avgToolCalls: number;
  /** 工具调用成功率 */
  toolSuccessRate: number;
  /** 估算总 token */
  totalEstimatedTokens: number;
}

/**
 * 级别统计
 */
export interface LevelStats {
  total: number;
  passed: number;
  successRate: number;
}

/**
 * 失败分析
 */
export interface FailureAnalysis {
  /** 按失败类型统计 */
  byType: Record<string, number>;
  /** 常见失败模式 */
  commonPatterns: string[];
  /** 改进建议 */
  suggestions: string[];
}

/**
 * 评测集
 */
export interface EvalSet {
  /** 评测集名称 */
  name: string;
  /** 描述 */
  description: string;
  /** 版本 */
  version: string;
  /** 用例列表 */
  cases: EvalCase[];
}
