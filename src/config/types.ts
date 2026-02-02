import { z } from 'zod';

/**
 * LLM 配置 Schema
 */
export const LLMConfigSchema = z.object({
  provider: z.enum(['anthropic', 'openai', 'openai-compatible']),
  model: z.string(),
  apiKey: z.string().optional(),
  baseUrl: z.string().optional(),
  headers: z.record(z.string()).optional(),
});

export type LLMConfig = z.infer<typeof LLMConfigSchema>;

/**
 * 完整配置 Schema
 */
export const ConfigSchema = z.object({
  llm: LLMConfigSchema,
});

export type Config = z.infer<typeof ConfigSchema>;

/**
 * 默认配置
 */
export const DEFAULT_CONFIG: Config = {
  llm: {
    provider: 'anthropic',
    model: 'claude-sonnet-4-20250514',
  },
};
