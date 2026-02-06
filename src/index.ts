#!/usr/bin/env bun

import * as readline from 'readline';
import { Agent } from './agent.ts';
import { loadConfig, initConfig, saveConfig, getAvailableProviders, getProvider, updateActiveProvider, addCustomProvider, getProviderModels } from './config/loader.ts';
import { MemoryConsolidator } from './memory/index.ts';
import { birthCeremony, hasSoul } from './birth/index.ts';
import { setInteractiveMode, setTuiMode } from './utils/confirmation.ts';
import { getTodayAuditLogs, getAuditStats } from './utils/audit-log.ts';
import { SanBotPiTUI, TUIStreamWriter, TUIToolSpinner } from './tui-pi/index.ts';
import { startWebServer } from './web/index.ts';
import { EvalRunner, basicEvalSet, intermediateEvalSet, advancedEvalSet, holdoutEvalSet, mergeEvalSets } from './eval/index.ts';
import type { Config, ProviderConfig } from './config/types.ts';

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
  sanbot web [port]              Start WebUI server (default port: 3000)
  sanbot eval [set]              Run evaluation (basic/intermediate/advanced/all)
  sanbot "your message"          Single execution mode
  sanbot                         Interactive mode (TUI)

Examples:
  sanbot init
  sanbot eval basic
  sanbot "list files in current directory"
  sanbot "read package.json and show me the dependencies"

Interactive Commands:
  /exit, /quit, /q               Exit interactive mode
  /clear                         Clear conversation history
  /memory                        Show memory status
  /audit                         Show audit logs
  /help                          Show help
  /connect [provider]            Connect to a provider (or list available)
  /model [model]                 Select model (or list available)

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

  // 处理 web 命令
  if (args[0] === 'web') {
    let portArg = args[1];
    if (portArg === '--port') {
      portArg = args[2];
    }
    const requestedPort = portArg ? Number.parseInt(portArg, 10) : NaN;
    const port = Number.isFinite(requestedPort) ? requestedPort : 3000;
    await startWebServer(port);
    return;
  }

  // 处理 eval 命令
  if (args[0] === 'eval') {
    await runEvaluation(config, args[1]);
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
 * 运行评测
 */
async function runEvaluation(config: any, setName?: string) {
  console.log('\n🧪 SanBot Evaluation System\n');

  // 选择评测集
  let evalSet;
  switch (setName) {
    case 'basic':
      evalSet = basicEvalSet;
      break;
    case 'intermediate':
      evalSet = intermediateEvalSet;
      break;
    case 'advanced':
      evalSet = advancedEvalSet;
      break;
    case 'holdout':
      evalSet = holdoutEvalSet;
      break;
    case 'all':
      evalSet = mergeEvalSets([basicEvalSet, intermediateEvalSet, advancedEvalSet]);
      break;
    default:
      console.log('Available eval sets:');
      console.log('  basic        - L1 single-step tasks');
      console.log('  intermediate - L2 multi-step tasks');
      console.log('  advanced     - L3 complex tasks');
      console.log('  holdout      - Reserved test set');
      console.log('  all          - All sets combined');
      console.log('\nUsage: sanbot eval <set>');
      return;
  }

  // 创建评测运行器
  const runner = new EvalRunner({
    agentConfig: {
      llmConfig: config.llm,
      maxSteps: 50,
    },
    includeHoldout: setName === 'holdout',
    verbose: true,
  });

  // 运行评测
  const report = await runner.run(evalSet);

  // 输出失败分析
  if (report.failureAnalysis.suggestions.length > 0) {
    console.log('\n💡 Improvement Suggestions:');
    for (const suggestion of report.failureAnalysis.suggestions) {
      console.log(`   - ${suggestion}`);
    }
  }

  console.log('\n✅ Evaluation complete!');
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
 * 交互模式 - 使用 TUI-PI (基于 pi-tui)
 */
async function interactiveMode(config: any) {
  // 交互模式启用危险操作确认
  setInteractiveMode(true);
  // TUI 模式下，危险操作自动批准（因为 stdin 被 TUI 占用）
  setTuiMode(true);

  const agent = new Agent({
    llmConfig: config.llm,
    maxSteps: 999,
  });

  // 初始化（加载记忆、灵魂、自创建工具）
  await agent.init();

  // 创建 TUI
  const tui = new SanBotPiTUI({
    sessionId: (agent as any).sessionId || 'unknown',
    model: config.llm.model,
    showThinking: false,
  });

  // 生成并显示主动问候语（带超时）
  const projectContext = `Current working directory: ${process.cwd()}\nProject: SanBot - Autonomous super-assistant with self-tooling capabilities`;

  tui.setStatus('waiting');
  let greeting: string;
  try {
    const timeoutPromise = new Promise<string>((_, reject) =>
      setTimeout(() => reject(new Error('Timeout')), 5000)
    );
    greeting = await Promise.race([
      agent.generateGreeting(projectContext),
      timeoutPromise
    ]);
  } catch (error) {
    greeting = "Hello! I'm SanBot. How can I help you today?";
  }

  // 显示问候语
  tui.startAssistantMessage();
  tui.appendAssistantMessage(greeting);
  tui.endAssistantMessage();
  tui.setStatus('idle');

  // 设置命令处理
  tui.onCommand = async (cmd: string) => {
    const command = cmd.toLowerCase();

    if (command === '/exit' || command === '/quit' || command === '/q') {
      tui.stop();
      process.exit(0);
    } else if (command === '/help') {
      tui.addSystemMessage('Commands: /exit, /help, /clear, /memory, /audit');
    } else if (command === '/clear') {
      agent.clearHistory();
      tui.addSystemMessage('Conversation history cleared.');
    } else if (command === '/memory') {
      tui.addSystemMessage('Memory consolidation: run "sanbot consolidate" to process daily logs.');
    } else if (command === '/audit') {
      tui.addSystemMessage('Audit logs: run "sanbot audit" in a separate terminal to view logs.');
    } else {
      tui.addSystemMessage(`Unknown command: ${cmd}`);
    }
  };

  // 设置消息提交处理
  tui.onSubmit = async (input: string) => {
    // 添加用户消息
    tui.addUserMessage(input);

    // 执行对话
    try {
      // 清除之前的工具调用
      tui.clearToolCalls();

      // 创建适配器
      const streamWriter = new TUIStreamWriter(tui);
      const toolSpinner = new TUIToolSpinner(tui);

      // 开始流式输出
      tui.startAssistantMessage();
      tui.setStatus('thinking');

      // 使用流式输出（传入 TUI 适配器）
      await agent.chatStream(input, streamWriter, toolSpinner);

      // 结束流式输出
      tui.endAssistantMessage();
      tui.setStatus('idle');
    } catch (error: any) {
      tui.addSystemMessage(`Error: ${error.message}`);
      tui.setStatus('idle');
    }
  };

  // 启动 TUI
  tui.start();
}

// 运行主函数
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
