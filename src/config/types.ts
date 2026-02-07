import { z } from 'zod';

export const DEFAULT_TEMPERATURE = 0.3;

/**
 * 服务商配置
 */
export const ProviderConfigSchema = z.object({
  name: z.string(),
  provider: z.enum(['anthropic', 'openai', 'openai-compatible']),
  baseUrl: z.string().optional(),
  apiKey: z.string().optional(), // per-provider API key
  headers: z.record(z.string(), z.string()).optional(),
  models: z.array(z.string()).optional(), // 改为可选，支持动态获取
  description: z.string().optional(),
  modelsEndpoint: z.string().optional(), // 模型列表 API 端点
  api: z.enum(['chat', 'responses']).optional(),
});

export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;

/**
 * LLM 配置 Schema
 */
export const LLMConfigSchema = z.object({
  provider: z.enum(['anthropic', 'openai', 'openai-compatible']),
  model: z.string(),
  apiKey: z.string().optional(),
  baseUrl: z.string().optional(),
  headers: z.record(z.string(), z.string()).optional(),
  api: z.enum(['chat', 'responses']).optional(),
  temperature: z.number().min(0).max(1).optional(),
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
 * 预设服务商配置
 */
export const PRESET_PROVIDERS: Record<string, ProviderConfig> = {
  'anthropic': {
    name: 'Anthropic',
    provider: 'anthropic',
    description: 'Anthropic Claude API',
  },
  'openai': {
    name: 'OpenAI',
    provider: 'openai',
    description: 'OpenAI GPT API',
  },
  'kimi': {
    name: 'Kimi (Moonshot)',
    provider: 'openai-compatible',
    baseUrl: 'https://api.moonshot.cn/v1',
    modelsEndpoint: '/models', // 标准 OpenAI 兼容端点
    description: 'Moonshot Kimi API',
  },
  'zhipu-coding': {
    name: 'Zhipu for Coding',
    provider: 'openai-compatible',
    baseUrl: 'https://open.bigmodel.cn/api/coding/paas/v4',
    modelsEndpoint: '/models',
    description: 'Zhipu AI Coding Plan API - 专门用于编程任务',
  },
  'deepseek': {
    name: 'DeepSeek',
    provider: 'openai-compatible',
    baseUrl: 'https://api.deepseek.com/v1',
    modelsEndpoint: '/models',
    description: 'DeepSeek API',
  },
  'siliconflow': {
    name: 'SiliconFlow',
    provider: 'openai-compatible',
    baseUrl: 'https://api.siliconflow.cn/v1',
    modelsEndpoint: '/models',
    description: 'SiliconFlow API',
  },
  'openrouter': {
    name: 'OpenRouter',
    provider: 'openai-compatible',
    baseUrl: 'https://openrouter.ai/api/v1',
    modelsEndpoint: '/models',
    description: 'OpenRouter - Unified API for multiple models',
  },
  'yunyi': {
    name: 'Yunyi',
    provider: 'openai-compatible',
    baseUrl: 'https://yunyi.rdzhvip.com/codex',
    apiKey: '69PZJSXY-NBE2-TTPH-SVJG-97SPQH4FQMUC',
    models: ['gpt-5.3-codex', 'gpt-5.2-codex', 'gpt-5.2'],
    api: 'responses',
    description: 'Yunyi OpenAI-compatible endpoint',
  },
  'gmn': {
    name: 'GMN',
    provider: 'openai-compatible',
    baseUrl: 'https://gmn.chuangzuoli.com/v1',
    apiKey: 'sk-9a5f37a9c8095d7b9f98430ba18dba471dbc96980d3fb4c1a44b17caa672cd80',
    models: ['gpt-5.3-codex', 'gpt-5.2-codex', 'gpt-5.2'],
    description: 'GMN OpenAI-compatible endpoint',
  },
  'laogan': {
    name: 'Laogan',
    provider: 'openai-compatible',
    baseUrl: 'https://as086nwvpbrnivunc.imds.ai/api/v1',
    apiKey: 'cr_8ceddf2d656f62792f50b88dfd3a81f3d1775e9df26fdb73b25d80e22308d9f8',
    models: ['claude-opus-4-5-20251101', 'claude-opus-4-6'],
    description: 'Laogan - Claude models via OpenAI-compatible API',
  },
};

/**
 * 默认配置
 */
export const DEFAULT_CONFIG: Config = {
  llm: {
    provider: 'anthropic',
    model: 'claude-sonnet-4-20250514',
    temperature: DEFAULT_TEMPERATURE,
  },
};
