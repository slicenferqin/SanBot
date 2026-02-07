import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import type { LanguageModel } from 'ai';
import type { LLMConfig } from '../config/types.ts';

/**
 * 获取 LLM Provider
 * 支持 Anthropic、OpenAI、OpenAI-compatible (中转站)
 */
export function getProvider(config: LLMConfig): LanguageModel {
  const apiKey = config.apiKey || process.env.SANBOT_API_KEY;

  if (!apiKey) {
    throw new Error('API key is required');
  }

  switch (config.provider) {
    case 'anthropic': {
      // Anthropic SDK 会自动添加 /v1，所以 baseUrl 不应该包含 /v1
      const anthropic = createAnthropic({
        apiKey,
        baseURL: config.baseUrl,
        headers: config.headers,
      });
      return anthropic(config.model);
    }

    case 'openai': {
      const openai = createOpenAI({
        apiKey,
        baseURL: config.baseUrl,
        headers: config.headers,
      });
      return openai(config.model);
    }

    case 'openai-compatible': {
      if (!config.baseUrl) {
        throw new Error('openai-compatible provider requires baseUrl');
      }
      const compatible = createOpenAI({
        apiKey,
        baseURL: config.baseUrl,
        headers: config.headers,
        compatibility: 'compatible',
      } as any);
      // 根据 api 字段选择 chat 或 responses 模式
      if (config.api === 'responses') {
        return compatible.responses(config.model);
      }
      return compatible.chat(config.model);
    }

    default:
      throw new Error(`Unknown provider: ${config.provider}`);
  }
}
