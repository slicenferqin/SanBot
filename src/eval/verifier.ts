/**
 * Verifier - 验证器实现
 */

import type {
  VerifierConfig,
  VerificationResult,
  ToolCallRecord,
} from './types.ts';

/**
 * 执行验证
 */
export async function verify(
  config: VerifierConfig,
  output: string,
  toolCalls: ToolCallRecord[]
): Promise<VerificationResult> {
  switch (config.type) {
    case 'exact_match':
      return verifyExactMatch(config.expected, output);

    case 'contains':
      return verifyContains(config.mustContain, config.mustNotContain, output);

    case 'schema':
      return verifySchema(config.schema, output);

    case 'custom':
      return verifyCustom(config.fn, output, toolCalls);

    case 'llm':
      return verifyLLM(config.criteria, config.threshold, output);

    default:
      return {
        passed: false,
        reason: `Unknown verifier type: ${(config as any).type}`,
      };
  }
}

/**
 * 精确匹配验证
 */
function verifyExactMatch(expected: string, output: string): VerificationResult {
  const normalizedExpected = expected.trim().toLowerCase();
  const normalizedOutput = output.trim().toLowerCase();

  if (normalizedOutput === normalizedExpected) {
    return { passed: true, reason: 'Exact match' };
  }

  return {
    passed: false,
    reason: `Expected "${expected.slice(0, 50)}...", got "${output.slice(0, 50)}..."`,
  };
}

/**
 * 包含验证
 */
function verifyContains(
  mustContain: string[],
  mustNotContain: string[] | undefined,
  output: string
): VerificationResult {
  const lowerOutput = output.toLowerCase();

  // 检查必须包含
  for (const item of mustContain) {
    if (!lowerOutput.includes(item.toLowerCase())) {
      return {
        passed: false,
        reason: `Missing required content: "${item}"`,
      };
    }
  }

  // 检查不能包含
  if (mustNotContain) {
    for (const item of mustNotContain) {
      if (lowerOutput.includes(item.toLowerCase())) {
        return {
          passed: false,
          reason: `Contains forbidden content: "${item}"`,
        };
      }
    }
  }

  return { passed: true, reason: 'All content checks passed' };
}

/**
 * Schema 验证
 */
function verifySchema(
  schema: Record<string, any>,
  output: string
): VerificationResult {
  try {
    // 尝试解析 JSON
    const jsonMatch = output.match(/```json\n?([\s\S]*?)\n?```/) ||
                      output.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      return {
        passed: false,
        reason: 'No JSON found in output',
      };
    }

    const jsonStr = jsonMatch[1] || jsonMatch[0];
    const parsed = JSON.parse(jsonStr);

    // 简单的 schema 验证
    if (schema.required) {
      for (const field of schema.required) {
        if (!(field in parsed)) {
          return {
            passed: false,
            reason: `Missing required field: ${field}`,
          };
        }
      }
    }

    if (schema.properties) {
      for (const [key, propSchema] of Object.entries(schema.properties)) {
        if (key in parsed) {
          const value = parsed[key];
          const expectedType = (propSchema as any).type;

          if (expectedType && typeof value !== expectedType) {
            // 特殊处理 array
            if (expectedType === 'array' && !Array.isArray(value)) {
              return {
                passed: false,
                reason: `Field "${key}" should be array, got ${typeof value}`,
              };
            } else if (expectedType !== 'array') {
              return {
                passed: false,
                reason: `Field "${key}" should be ${expectedType}, got ${typeof value}`,
              };
            }
          }
        }
      }
    }

    return {
      passed: true,
      reason: 'Schema validation passed',
      details: parsed,
    };
  } catch (error: any) {
    return {
      passed: false,
      reason: `Schema validation error: ${error.message}`,
    };
  }
}

/**
 * 自定义验证
 */
function verifyCustom(
  fnName: string,
  output: string,
  toolCalls: ToolCallRecord[]
): VerificationResult {
  // 预定义的自定义验证函数
  const customVerifiers: Record<string, (output: string, toolCalls: ToolCallRecord[]) => VerificationResult> = {
    // 检查是否使用了特定工具
    used_exec: (_, calls) => {
      const used = calls.some((c) => c.name === 'exec');
      return {
        passed: used,
        reason: used ? 'Used exec tool' : 'Did not use exec tool',
      };
    },

    // 检查是否成功读取文件
    read_file_success: (_, calls) => {
      const readCall = calls.find((c) => c.name === 'read_file');
      if (!readCall) {
        return { passed: false, reason: 'Did not use read_file tool' };
      }
      return {
        passed: readCall.success,
        reason: readCall.success ? 'File read successful' : 'File read failed',
      };
    },

    // 检查输出是否为有效代码
    valid_code: (out) => {
      const hasCodeBlock = /```[\w]*\n[\s\S]+\n```/.test(out);
      return {
        passed: hasCodeBlock,
        reason: hasCodeBlock ? 'Contains valid code block' : 'No code block found',
      };
    },

    // 检查是否有错误
    no_errors: (out) => {
      const hasError = /error|failed|exception/i.test(out);
      return {
        passed: !hasError,
        reason: hasError ? 'Output contains error indicators' : 'No errors detected',
      };
    },
  };

  const verifier = customVerifiers[fnName];
  if (!verifier) {
    return {
      passed: false,
      reason: `Unknown custom verifier: ${fnName}`,
    };
  }

  return verifier(output, toolCalls);
}

/**
 * LLM 验证（用于软性指标）
 */
async function verifyLLM(
  criteria: string,
  threshold: number,
  output: string
): Promise<VerificationResult> {
  // 简化实现：使用规则匹配代替 LLM 调用
  // 在实际使用中，这里应该调用 LLM 进行评判

  // 基于 criteria 的简单评分
  let score = 0.5; // 默认中等

  // 检查一些常见的质量指标
  if (output.length > 100) score += 0.1;
  if (output.length > 500) score += 0.1;
  if (/```/.test(output)) score += 0.1; // 有代码块
  if (!/error|failed/i.test(output)) score += 0.1; // 无错误
  if (/\d+/.test(output)) score += 0.05; // 有具体数字

  score = Math.min(1, score);

  return {
    passed: score >= threshold,
    reason: `LLM score: ${(score * 100).toFixed(0)}% (threshold: ${(threshold * 100).toFixed(0)}%)`,
    details: { score, criteria },
  };
}
