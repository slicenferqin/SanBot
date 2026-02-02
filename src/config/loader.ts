import { existsSync } from 'fs';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { homedir } from 'os';
import { join } from 'path';
import { Config, ConfigSchema, DEFAULT_CONFIG } from './types.ts';

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
