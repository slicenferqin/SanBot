import { existsSync } from 'fs';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { homedir } from 'os';
import { join } from 'path';
import { ConfigSchema, DEFAULT_CONFIG, PRESET_PROVIDERS, DEFAULT_TEMPERATURE, type Config, type ProviderConfig } from './types.ts';

/**
 * 缓存的模型列表
 */
const modelsCache = new Map<string, { models: string[]; timestamp: number }>();
const CACHE_TTL = 1000 * 60 * 60; // 1小时缓存

/**
 * 从服务商 API 拉取可用模型列表
 */
export async function fetchProviderModels(
  provider: ProviderConfig,
  apiKey?: string
): Promise<string[]> {
  // 检查缓存
  if (provider.baseUrl) {
    const cacheKey = provider.baseUrl;
    const cached = modelsCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.models;
    }
  }

  // 如果没有 baseUrl 或 modelsEndpoint，返回默认空列表
  if (!provider.baseUrl || !provider.modelsEndpoint) {
    return provider.models || [];
  }

  try {
    const url = `${provider.baseUrl}${provider.modelsEndpoint}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...provider.headers,
    };

    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const response = await fetch(url, { headers });
    
    if (!response.ok) {
      console.warn(`Failed to fetch models: ${response.status} ${response.statusText}`);
      return provider.models || [];
    }

    const data: any = await response.json();
    
    // 处理 OpenAI 兼容的响应格式
    let models: string[] = [];
    if (data.data && Array.isArray(data.data)) {
      models = data.data.map((m: any) => m.id || m.name);
    } else if (data.models && Array.isArray(data.models)) {
      models = data.models;
    } else if (Array.isArray(data)) {
      models = data;
    }

    // 缓存结果
    if (provider.baseUrl) {
      modelsCache.set(provider.baseUrl, {
        models,
        timestamp: Date.now(),
      });
    }

    return models;
  } catch (error) {
    console.warn(`Error fetching models from ${provider.name}:`, error);
    return provider.models || [];
  }
}

/**
 * 获取服务商的可用模型列表（带缓存）
 */
export async function getProviderModels(
  providerId: string,
  config: Config,
  apiKey?: string
): Promise<string[]> {
  const providers = getAvailableProviders(config);
  const provider = providers[providerId];
  
  if (!provider) {
    return [];
  }

  // 如果有硬编码的 models 列表且没有 modelsEndpoint，直接返回
  if (provider.models && !provider.modelsEndpoint) {
    return provider.models;
  }

  // 动态获取
  return fetchProviderModels(provider, apiKey || provider.apiKey || config.llm.apiKey);
}

/**
 * 配置文件路径
 */
export const CONFIG_DIR = join(homedir(), '.sanbot');
export const CONFIG_PATH = join(CONFIG_DIR, 'config.json');

/**
 * 加载配置文件
 * 优先级：配置文件 > 环境变量 > 默认值
 */
export async function loadConfig(): Promise<Config> {
  let config: Config;

  // 1. 尝试从配置文件加载
  if (existsSync(CONFIG_PATH)) {
    try {
      const content = await readFile(CONFIG_PATH, 'utf-8');
      const parsed = JSON.parse(content);
      config = ConfigSchema.parse(parsed);
    } catch (error) {
      console.error(`Failed to load config from ${CONFIG_PATH}:`, error);
      console.log('Using default config...');
      config = { ...DEFAULT_CONFIG };
    }
  } else {
    config = { ...DEFAULT_CONFIG };
  }

  // 2. 环境变量覆盖
  if (!config.llm.apiKey) {
    config.llm.apiKey =
      process.env.SANBOT_API_KEY ||
      process.env.ANTHROPIC_API_KEY ||
      process.env.OPENAI_API_KEY;
  }

  // 3. 验证必要字段
  if (config.llm.provider === 'openai-compatible' && !config.llm.baseUrl) {
    throw new Error(
      'openai-compatible provider requires baseUrl in config.json'
    );
  }

  if (!config.llm.apiKey) {
    throw new Error(
      'API key not found. Please set SANBOT_API_KEY environment variable or add apiKey to config.json'
    );
  }

  return config;
}

/**
 * 保存配置文件
 */
export async function saveConfig(config: Config): Promise<void> {
  // 确保目录存在
  if (!existsSync(CONFIG_DIR)) {
    await mkdir(CONFIG_DIR, { recursive: true });
  }

  // 写入配置
  await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
}

/**
 * 初始化配置（交互式）
 */
export async function initConfig(): Promise<void> {
  console.log('🚀 Initializing SanBot configuration...\n');

  // 创建默认配置
  const config: Config = {
    llm: {
      provider: 'anthropic',
      model: 'claude-sonnet-4-20250514',
      apiKey: process.env.ANTHROPIC_API_KEY || '',
    },
  };

  // 保存配置
  await saveConfig(config);

  console.log(`✅ Config saved to: ${CONFIG_PATH}`);
  console.log('\n📝 Please edit the config file to set your API key:');
  console.log(`   ${CONFIG_PATH}\n`);
  console.log('Or set environment variable:');
  console.log('   export SANBOT_API_KEY=your-api-key\n');
}

/**
 * 获取所有可用的服务商
 */
export function getAvailableProviders(config: Config): Record<string, ProviderConfig> {
  return PRESET_PROVIDERS;
}

/**
 * 获取指定服务商的配置
 */
export function getProvider(config: Config, providerId: string): ProviderConfig | undefined {
  return PRESET_PROVIDERS[providerId];
}

/**
 * 添加自定义服务商（暂不支持，可以后续扩展）
 */
export async function addCustomProvider(
  config: Config,
  providerId: string,
  providerConfig: ProviderConfig
): Promise<void> {
  // 暂时简单实现：直接保存到文件
  console.log('Adding custom providers is not fully supported yet.');
}

/**
 * 更新当前使用的服务商和模型
 */
export async function updateActiveProvider(
  config: Config,
  providerId: string,
  model: string,
  apiKey: string | undefined,
  options?: { temperature?: number }
): Promise<void> {
  const provider = getProvider(config, providerId);
  if (!provider) {
    throw new Error(`Provider "${providerId}" not found`);
  }

  const temperature = typeof options?.temperature === 'number'
    ? clampTemperature(options.temperature)
    : config.llm.temperature ?? DEFAULT_TEMPERATURE;

  // 优先使用传入的 apiKey，其次用 provider 预设的 apiKey，最后用当前配置的
  const resolvedApiKey = apiKey || provider.apiKey || config.llm.apiKey;

  config.llm = {
    provider: provider.provider,
    model,
    apiKey: resolvedApiKey,
    baseUrl: provider.baseUrl,
    headers: provider.headers,
    api: provider.api,
    temperature,
  };

  await saveConfig(config);
}

function clampTemperature(value: number): number {
  if (Number.isNaN(value)) return DEFAULT_TEMPERATURE;
  return Math.min(1, Math.max(0, value));
}
