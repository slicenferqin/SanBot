/**
 * Eval Runner - 评测执行器
 */

import type {
  EvalCase,
  EvalResult,
  EvalMetrics,
  EvalReport,
  EvalSummary,
  EvalSet,
  VerificationResult,
  ToolCallRecord,
  FailureAttribution,
  FailureAnalysis,
  LevelStats,
} from './types.ts';
import { Agent, type AgentConfig } from '../agent.ts';
import { verify } from './verifier.ts';
import { attributeFailure } from './failure.ts';

/**
 * 评测运行器配置
 */
export interface EvalRunnerConfig {
  /** Agent 配置 */
  agentConfig: AgentConfig;
  /** 是否包含 holdout 集 */
  includeHoldout?: boolean;
  /** 并行度 */
  concurrency?: number;
  /** 默认超时（ms） */
  defaultTimeout?: number;
  /** 是否详细输出 */
  verbose?: boolean;
}

/**
 * 评测运行器
 */
export class EvalRunner {
  private config: EvalRunnerConfig;

  constructor(config: EvalRunnerConfig) {
    this.config = {
      concurrency: 1,
      defaultTimeout: 60000,
      verbose: false,
      ...config,
    };
  }

  /**
   * 运行评测集
   */
  async run(evalSet: EvalSet): Promise<EvalReport> {
    const startTime = Date.now();
    const results: EvalResult[] = [];

    // 过滤用例
    let cases = evalSet.cases;
    if (!this.config.includeHoldout) {
      cases = cases.filter((c) => !c.isHoldout);
    }

    console.log(`\n🧪 Running eval set: ${evalSet.name}`);
    console.log(`   Cases: ${cases.length} (${evalSet.cases.length - cases.length} holdout excluded)`);
    console.log('');

    // 逐个执行（暂不支持并行，避免状态冲突）
    for (let i = 0; i < cases.length; i++) {
      const evalCase = cases[i];
      const progress = `[${i + 1}/${cases.length}]`;

      if (this.config.verbose) {
        console.log(`${progress} Running: ${evalCase.name}`);
      }

      const result = await this.runCase(evalCase);
      results.push(result);

      const status = result.passed ? '✓' : '✗';
      const statusColor = result.passed ? '\x1b[32m' : '\x1b[31m';
      console.log(`${statusColor}${status}\x1b[0m ${progress} ${evalCase.name} (${result.metrics.totalDurationMs}ms)`);

      if (!result.passed && this.config.verbose) {
        console.log(`   Reason: ${result.verification.reason}`);
        if (result.failureAttribution) {
          console.log(`   Attribution: ${result.failureAttribution.type} - ${result.failureAttribution.description}`);
        }
      }
    }

    // 生成报告
    const report = this.generateReport(evalSet.name, results);

    console.log('\n📊 Summary:');
    console.log(`   Success Rate: ${(report.summary.successRate * 100).toFixed(1)}%`);
    console.log(`   Avg Duration: ${report.summary.avgDurationMs.toFixed(0)}ms`);
    console.log(`   Tool Success Rate: ${(report.summary.toolSuccessRate * 100).toFixed(1)}%`);
    console.log(`   Total Time: ${Date.now() - startTime}ms`);

    return report;
  }

  /**
   * 运行单个用例
   */
  async runCase(evalCase: EvalCase): Promise<EvalResult> {
    const startTime = Date.now();
    const toolCalls: ToolCallRecord[] = [];
    let output = '';
    let llmCallCount = 0;

    try {
      // 创建新的 Agent 实例（隔离状态）
      const agent = new Agent(this.config.agentConfig);
      await agent.init();

      // 设置超时
      const timeout = evalCase.timeout || this.config.defaultTimeout!;
      const timeoutPromise = new Promise<string>((_, reject) => {
        setTimeout(() => reject(new Error('Timeout')), timeout);
      });

      // 执行任务
      // 注意：这里我们使用 chat 而不是 chatStream，以便更好地捕获工具调用
      const chatPromise = agent.chat(evalCase.input);
      output = await Promise.race([chatPromise, timeoutPromise]);
      llmCallCount = 1; // 简化计数

      // 验证结果
      const verification = await verify(evalCase.verifier, output, toolCalls);

      // 计算指标
      const metrics = this.calculateMetrics(
        startTime,
        toolCalls,
        output,
        llmCallCount
      );

      // 失败归因
      let failureAttribution: FailureAttribution | undefined;
      if (!verification.passed) {
        failureAttribution = attributeFailure(
          evalCase,
          output,
          toolCalls,
          verification
        );
      }

      return {
        caseId: evalCase.id,
        passed: verification.passed,
        output,
        toolCalls,
        verification,
        metrics,
        failureAttribution,
      };
    } catch (error: any) {
      const metrics = this.calculateMetrics(startTime, toolCalls, output, llmCallCount);

      return {
        caseId: evalCase.id,
        passed: false,
        output,
        toolCalls,
        verification: {
          passed: false,
          reason: `Execution error: ${error.message}`,
        },
        metrics,
        failureAttribution: {
          type: 'reasoning',
          description: `Execution failed: ${error.message}`,
          suggestion: 'Check agent configuration and input format',
        },
      };
    }
  }

  /**
   * 计算指标
   */
  private calculateMetrics(
    startTime: number,
    toolCalls: ToolCallRecord[],
    output: string,
    llmCallCount: number
  ): EvalMetrics {
    const successfulCalls = toolCalls.filter((c) => c.success).length;

    return {
      totalDurationMs: Date.now() - startTime,
      toolCallCount: toolCalls.length,
      toolSuccessRate: toolCalls.length > 0 ? successfulCalls / toolCalls.length : 1,
      estimatedTokens: this.estimateTokens(output),
      llmCallCount,
    };
  }

  /**
   * 估算 token 数
   */
  private estimateTokens(text: string): number {
    // 简单估算：约 4 字符 = 1 token
    return Math.ceil(text.length / 4);
  }

  /**
   * 生成报告
   */
  private generateReport(evalSetName: string, results: EvalResult[]): EvalReport {
    const summary = this.calculateSummary(results);
    const byLevel = this.calculateByLevel(results);
    const byTag = this.calculateByTag(results);
    const failureAnalysis = this.analyzeFailures(results);

    return {
      id: `eval-${Date.now()}`,
      timestamp: new Date().toISOString(),
      evalSetName,
      summary,
      byLevel,
      byTag,
      results,
      failureAnalysis,
    };
  }

  /**
   * 计算总体指标
   */
  private calculateSummary(results: EvalResult[]): EvalSummary {
    const passedCases = results.filter((r) => r.passed).length;
    const totalDuration = results.reduce((sum, r) => sum + r.metrics.totalDurationMs, 0);
    const totalToolCalls = results.reduce((sum, r) => sum + r.metrics.toolCallCount, 0);
    const totalSuccessfulToolCalls = results.reduce(
      (sum, r) => sum + r.metrics.toolCallCount * r.metrics.toolSuccessRate,
      0
    );
    const totalTokens = results.reduce((sum, r) => sum + r.metrics.estimatedTokens, 0);

    return {
      totalCases: results.length,
      passedCases,
      successRate: results.length > 0 ? passedCases / results.length : 0,
      avgDurationMs: results.length > 0 ? totalDuration / results.length : 0,
      avgToolCalls: results.length > 0 ? totalToolCalls / results.length : 0,
      toolSuccessRate: totalToolCalls > 0 ? totalSuccessfulToolCalls / totalToolCalls : 1,
      totalEstimatedTokens: totalTokens,
    };
  }

  /**
   * 按级别统计
   */
  private calculateByLevel(results: EvalResult[]): Record<string, LevelStats> {
    // 这里需要从原始用例获取级别信息
    // 简化实现：返回空对象
    return {};
  }

  /**
   * 按标签统计
   */
  private calculateByTag(results: EvalResult[]): Record<string, number> {
    // 简化实现
    return {};
  }

  /**
   * 分析失败
   */
  private analyzeFailures(results: EvalResult[]): FailureAnalysis {
    const failures = results.filter((r) => !r.passed);
    const byType: Record<string, number> = {
      context: 0,
      tool: 0,
      reasoning: 0,
      verification: 0,
    };

    for (const failure of failures) {
      if (failure.failureAttribution) {
        byType[failure.failureAttribution.type]++;
      }
    }

    // 提取常见模式
    const patterns: string[] = [];
    const suggestions: string[] = [];

    if (byType.context > 0) {
      patterns.push(`${byType.context} cases failed due to missing context`);
      suggestions.push('Improve context gathering and memory retrieval');
    }
    if (byType.tool > 0) {
      patterns.push(`${byType.tool} cases failed due to tool errors`);
      suggestions.push('Review tool descriptions and parameter schemas');
    }
    if (byType.reasoning > 0) {
      patterns.push(`${byType.reasoning} cases failed due to reasoning errors`);
      suggestions.push('Consider adding more examples to system prompt');
    }
    if (byType.verification > 0) {
      patterns.push(`${byType.verification} cases failed verification`);
      suggestions.push('Review verifier configuration and expected outputs');
    }

    return {
      byType,
      commonPatterns: patterns,
      suggestions,
    };
  }
}
