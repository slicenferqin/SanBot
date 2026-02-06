/**
 * Failure Attribution - 失败归因
 */

import type {
  EvalCase,
  ToolCallRecord,
  VerificationResult,
  FailureAttribution,
} from './types.ts';

/**
 * 归因失败原因
 *
 * 失败类型：
 * - context: 没拿到关键信息
 * - tool: 选错工具或参数
 * - reasoning: 推理路径错误
 * - verification: 错误未被拦住
 */
export function attributeFailure(
  evalCase: EvalCase,
  output: string,
  toolCalls: ToolCallRecord[],
  verification: VerificationResult
): FailureAttribution {
  // 1. 检查是否是工具失败
  const toolFailure = checkToolFailure(evalCase, toolCalls);
  if (toolFailure) return toolFailure;

  // 2. 检查是否是上下文失败
  const contextFailure = checkContextFailure(evalCase, output, toolCalls);
  if (contextFailure) return contextFailure;

  // 3. 检查是否是验证失败
  const verificationFailure = checkVerificationFailure(verification);
  if (verificationFailure) return verificationFailure;

  // 4. 默认归因为推理失败
  return {
    type: 'reasoning',
    description: 'Agent reasoning did not produce expected result',
    suggestion: 'Review system prompt and add more specific instructions',
  };
}

/**
 * 检查工具失败
 */
function checkToolFailure(
  evalCase: EvalCase,
  toolCalls: ToolCallRecord[]
): FailureAttribution | null {
  // 检查是否有工具调用失败
  const failedCalls = toolCalls.filter((c) => !c.success);
  if (failedCalls.length > 0) {
    const failedNames = failedCalls.map((c) => c.name).join(', ');
    return {
      type: 'tool',
      description: `Tool calls failed: ${failedNames}`,
      suggestion: 'Check tool implementation and input parameters',
    };
  }

  // 检查是否使用了期望的工具
  if (evalCase.expectedTools && evalCase.expectedTools.length > 0) {
    const usedTools = new Set(toolCalls.map((c) => c.name));
    const missingTools = evalCase.expectedTools.filter((t) => !usedTools.has(t));

    if (missingTools.length > 0) {
      return {
        type: 'tool',
        description: `Expected tools not used: ${missingTools.join(', ')}`,
        suggestion: 'Improve tool descriptions to guide agent selection',
      };
    }
  }

  // 检查是否使用了不相关的工具
  if (toolCalls.length > 10) {
    return {
      type: 'tool',
      description: 'Too many tool calls, possible infinite loop or confusion',
      suggestion: 'Add clearer stopping conditions and tool selection guidance',
    };
  }

  return null;
}

/**
 * 检查上下文失败
 */
function checkContextFailure(
  evalCase: EvalCase,
  output: string,
  toolCalls: ToolCallRecord[]
): FailureAttribution | null {
  // 检查是否没有任何工具调用（可能缺少上下文）
  if (toolCalls.length === 0 && evalCase.expectedTools && evalCase.expectedTools.length > 0) {
    return {
      type: 'context',
      description: 'No tool calls made, agent may lack necessary context',
      suggestion: 'Ensure relevant context is provided in system prompt',
    };
  }

  // 检查输出是否表明缺少信息
  const missingInfoPatterns = [
    /i don't have/i,
    /i cannot access/i,
    /no information/i,
    /not available/i,
    /unable to find/i,
    /没有找到/,
    /无法访问/,
    /缺少信息/,
  ];

  for (const pattern of missingInfoPatterns) {
    if (pattern.test(output)) {
      return {
        type: 'context',
        description: 'Agent indicated missing information',
        suggestion: 'Provide more context or improve memory retrieval',
      };
    }
  }

  return null;
}

/**
 * 检查验证失败
 */
function checkVerificationFailure(
  verification: VerificationResult
): FailureAttribution | null {
  // 如果验证器本身有问题
  if (verification.reason.includes('Unknown verifier')) {
    return {
      type: 'verification',
      description: 'Verifier configuration error',
      suggestion: 'Fix verifier configuration',
    };
  }

  // 如果是 schema 验证失败
  if (verification.reason.includes('Schema validation')) {
    return {
      type: 'verification',
      description: 'Output format does not match expected schema',
      suggestion: 'Add output format instructions to system prompt',
    };
  }

  return null;
}

/**
 * 生成改进建议
 */
export function generateSuggestions(
  failures: Array<{ attribution: FailureAttribution; case: EvalCase }>
): string[] {
  const suggestions: string[] = [];
  const typeCount: Record<string, number> = {};

  // 统计失败类型
  for (const { attribution } of failures) {
    typeCount[attribution.type] = (typeCount[attribution.type] || 0) + 1;
  }

  // 根据失败类型生成建议
  if (typeCount.context > 0) {
    suggestions.push(
      `${typeCount.context} context failures: Consider improving memory retrieval and context injection`
    );
  }

  if (typeCount.tool > 0) {
    suggestions.push(
      `${typeCount.tool} tool failures: Review tool descriptions and parameter schemas`
    );
  }

  if (typeCount.reasoning > 0) {
    suggestions.push(
      `${typeCount.reasoning} reasoning failures: Add more examples and clearer instructions to system prompt`
    );
  }

  if (typeCount.verification > 0) {
    suggestions.push(
      `${typeCount.verification} verification failures: Review verifier configurations and expected outputs`
    );
  }

  return suggestions;
}
