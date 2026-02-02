#!/usr/bin/env bun

import { Agent } from './agent.ts';
import { loadConfig, initConfig } from './config/loader.ts';

/**
 * 打印使用说明
 */
function printUsage() {
  console.log(`
SanBot - Autonomous Super-Assistant

Usage:
  sanbot init                    Initialize configuration
  sanbot "your message"          Single execution mode
  sanbot                         Interactive mode (coming soon)

Examples:
  sanbot init
  sanbot "list files in current directory"
  sanbot "read package.json and show me the dependencies"

Environment Variables:
  SANBOT_API_KEY                 API key for LLM provider
  ANTHROPIC_API_KEY              Anthropic API key (fallback)
  OPENAI_API_KEY                 OpenAI API key (fallback)
`);
}

/**
 * 主函数
 */
async function main() {
  const args = process.argv.slice(2);

  // 处理 init 命令
  if (args[0] === 'init') {
    await initConfig();
    return;
  }

  // 处理 help
  if (args[0] === '--help' || args[0] === '-h') {
    printUsage();
    return;
  }

  // 加载配置
  let config;
  try {
    config = await loadConfig();
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    console.log('\n💡 Run "sanbot init" to create a config file.');
    process.exit(1);
  }

  // 单次执行模式
  if (args.length > 0) {
    const message = args.join(' ');
    await singleExecution(config, message);
  } else {
    // 交互模式（暂未实现）
    console.log('❌ Interactive mode not implemented yet.');
    console.log('💡 Use: sanbot "your message"');
    printUsage();
    process.exit(1);
  }
}

/**
 * 单次执行模式
 */
async function singleExecution(config: any, message: string) {
  console.log('🤖 SanBot is thinking...\n');

  try {
    const agent = new Agent({
      llmConfig: config.llm,
      maxSteps: 10,
    });

    const response = await agent.chat(message);
    console.log(response);
    console.log('\n✅ Done!');
  } catch (error: any) {
    console.error('\n❌ Error:', JSON.stringify(error, null, 2));
    process.exit(1);
  }
}

// 运行主函数
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
