#!/usr/bin/env bun

import * as readline from 'readline';
import { Agent } from './agent.ts';
import { loadConfig, initConfig } from './config/loader.ts';
import { MemoryConsolidator } from './memory/index.ts';
import { birthCeremony, hasSoul } from './birth/index.ts';
import { setInteractiveMode } from './utils/confirmation.ts';
import { getTodayAuditLogs, getAuditStats } from './utils/audit-log.ts';

/**
 * 显示审计日志
 */
async function showAuditLogs() {
  console.log('\n📋 Audit Logs (Today)\n');

  try {
    const logs = await getTodayAuditLogs();
    const stats = await getAuditStats();

    if (logs.length === 0) {
      console.log('  No audit logs today. 🎉\n');
      return;
    }

    // 显示统计信息
    console.log('📊 Statistics:');
    console.log(`  Total: ${stats.total}`);
    console.log(`  ✅ Approved: ${stats.approved}`);
    console.log(`  ❌ Rejected: ${stats.rejected}`);
    console.log(`  🚫 Auto-blocked: ${stats.autoBlocked}`);
    console.log(`\n  By Level:`);
    console.log(`    🟢 Safe: ${stats.byLevel.safe}`);
    console.log(`    🟡 Warning: ${stats.byLevel.warning}`);
    console.log(`    🟠 Danger: ${stats.byLevel.danger}`);
    console.log(`    🔴 Critical: ${stats.byLevel.critical}`);
    console.log('\n' + '─'.repeat(80) + '\n');

    // 显示详细日志
    console.log('📝 Detailed Logs:\n');
    for (const log of logs) {
      const time = new Date(log.timestamp).toLocaleTimeString();
      const levelIcon = {
        safe: '🟢',
        warning: '🟡',
        danger: '🟠',
        critical: '🔴',
      }[log.dangerLevel];

      const actionIcon = {
        approved: '✅',
        rejected: '❌',
        auto_blocked: '🚫',
      }[log.action];

      console.log(`${time} ${levelIcon} ${actionIcon} ${log.action.toUpperCase()}`);
      console.log(`  Command: ${log.command}`);
      
      if (log.reasons.length > 0) {
        console.log(`  Reasons:`);
        for (const reason of log.reasons) {
          console.log(`    • ${reason}`);
        }
      }

      if (log.executionResult) {
        const result = log.executionResult;
        if (result.success) {
          console.log(`  Result: ✅ Success (exit code: ${result.exitCode ?? 0})`);
        } else {
          console.log(`  Result: ❌ Failed`);
          if (result.error) {
            console.log(`  Error: ${result.error}`);
          }
        }
      }

      console.log('');
    }
  } catch (error: any) {
    console.error('❌ Error reading audit logs:', error.message);
  }
}

/**
 * 打印使用说明
 */
function printUsage() {
  console.log(`
SanBot - Autonomous Super-Assistant

Usage:
  sanbot init                    Initialize configuration
  sanbot birth                   Run birth ceremony (first-time setup)
  sanbot consolidate             Consolidate memories (L0 → L1 → L2)
  sanbot "your message"          Single execution mode
  sanbot                         Interactive mode

Examples:
  sanbot init
  sanbot "list files in current directory"
  sanbot "read package.json and show me the dependencies"

Interactive Commands:
  /exit, /quit, /q               Exit interactive mode
  /clear                         Clear conversation history
  /memory                        Show memory status
  /audit                         Show audit logs
  /help                          Show help

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

  // 处理 birth 命令
  if (args[0] === 'birth') {
    await birthCeremony(config.llm);
    return;
  }

  // 处理 consolidate 命令
  if (args[0] === 'consolidate') {
    const consolidator = new MemoryConsolidator(config.llm);
    await consolidator.runFullConsolidation();
    return;
  }

  // 检查是否需要诞生仪式
  if (!hasSoul()) {
    console.log('\n✨ 检测到这是首次运行，让我们开始诞生仪式...\n');
    await birthCeremony(config.llm);
    return;
  }

  // 单次执行模式
  if (args.length > 0) {
    const message = args.join(' ');
    await singleExecution(config, message);
  } else {
    // 交互模式
    await interactiveMode(config);
  }
}

/**
 * 单次执行模式
 */
async function singleExecution(config: any, message: string) {
  console.log('🤖 SanBot is thinking...\n');

  // 单次执行模式不启用交互确认（危险操作自动跳过）
  setInteractiveMode(false);

  try {
    const agent = new Agent({
      llmConfig: config.llm,
      maxSteps: 999,
    });

    // 初始化（加载记忆、灵魂、自创建工具）
    await agent.init();

    // 使用流式输出
    await agent.chatStream(message);
    console.log('\n✅ Done!');
  } catch (error: any) {
    console.error('\n❌ Error:', JSON.stringify(error, null, 2));
    process.exit(1);
  }
}

/**
 * 交互模式
 */
async function interactiveMode(config: any) {
  console.log('🤖 SanBot Interactive Mode');
  console.log('Type /help for commands, /exit to quit.\n');

  // 交互模式启用危险操作确认
  setInteractiveMode(true);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const agent = new Agent({
    llmConfig: config.llm,
    maxSteps: 999,
  });

  // 初始化（加载记忆、灵魂、自创建工具）
  await agent.init();

  const prompt = () => {
    rl.question('\x1b[36m❯\x1b[0m ', async (input) => {
      const trimmed = input.trim();

      // 空输入
      if (!trimmed) {
        prompt();
        return;
      }

      // 处理命令
      if (trimmed.startsWith('/')) {
        const cmd = trimmed.toLowerCase();
        if (cmd === '/exit' || cmd === '/quit' || cmd === '/q') {
          console.log('👋 Goodbye!');
          rl.close();
          process.exit(0);
        } else if (cmd === '/help') {
          printUsage();
          prompt();
          return;
        } else if (cmd === '/clear') {
          agent.clearHistory();
          console.clear();
          console.log('🤖 SanBot Interactive Mode');
          console.log('Conversation cleared. Type /help for commands, /exit to quit.\n');
          prompt();
          return;
        } else if (cmd === '/memory') {
          console.log('\n📝 Memory consolidation: run "sanbot consolidate" to process daily logs.\n');
          prompt();
          return;
        } else if (cmd === '/audit') {
          await showAuditLogs();
          prompt();
          return;
        } else {
          console.log(`Unknown command: ${trimmed}`);
          prompt();
          return;
        }
      }

      // 执行对话
      console.log('\n');
      try {
        // 使用流式输出
        await agent.chatStream(trimmed);
        console.log();
      } catch (error: any) {
        console.error('❌ Error:', error.message);
      }

      prompt();
    });
  };

  // 处理 Ctrl+C
  rl.on('close', () => {
    console.log('\n👋 Goodbye!');
    process.exit(0);
  });

  prompt();
}

// 运行主函数
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
