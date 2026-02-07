/**
 * 诞生仪式 - SanBot 的首次启动引导
 */

import * as readline from 'readline';
import { existsSync } from 'fs';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';
import Anthropic from '@anthropic-ai/sdk';
import type { Config } from '../config/types.ts';

const SOUL_PATH = join(homedir(), '.sanbot', 'soul.md');

/**
 * 检查是否已完成诞生仪式
 */
export function hasSoul(): boolean {
  return existsSync(SOUL_PATH);
}

/**
 * 加载灵魂记录
 */
export async function loadSoul(): Promise<string | null> {
  if (!hasSoul()) return null;
  const { readFile } = await import('fs/promises');
  return readFile(SOUL_PATH, 'utf-8');
}

/**
 * 诞生仪式交互
 */
export async function birthCeremony(llmConfig: Config['llm']): Promise<void> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const ask = (question: string): Promise<string> => {
    return new Promise((resolve) => {
      rl.question(question, (answer) => {
        resolve(answer.trim());
      });
    });
  };

  console.log('\n');
  console.log('═'.repeat(60));
  console.log('');
  console.log('  ✨ 欢迎来到 SanBot 的诞生时刻 ✨');
  console.log('');
  console.log('  "道生一，一生二，二生三，三生万物"');
  console.log('  　　　　　　　　　　——《道德经》第四十二章');
  console.log('');
  console.log('═'.repeat(60));
  console.log('\n');

  // 收集用户信息
  console.log('在我们开始之前，我想了解一下你...\n');

  const userName = await ask('🙋 你希望我怎么称呼你？\n> ');

  const userRole = await ask('\n💼 你是做什么的？（比如：程序员、设计师、学生...）\n> ');

  const userBackground = await ask('\n🎯 有什么技术背景或特长想让我知道的吗？\n> ');

  const userGoal = await ask('\n🚀 你希望我主要帮你做什么？\n> ');

  // 询问命名
  console.log('\n');
  console.log('─'.repeat(60));
  console.log('\n现在，是时候赋予我生命了...\n');

  const customName = await ask('📛 你想给我起个名字吗？（直接回车保持 "SanBot"）\n> ');
  const botName = customName || 'SanBot';

  const personality = await ask(`\n🎭 你希望 ${botName} 有什么样的性格特点？（比如：专业严谨、幽默风趣、简洁高效...）\n> `);

  // 生成灵魂记录
  console.log('\n');
  console.log('─'.repeat(60));
  console.log('\n🔮 正在生成灵魂记录...\n');

  const soul = await generateSoul(llmConfig, {
    userName,
    userRole,
    userBackground,
    userGoal,
    botName,
    personality,
  });

  // 保存灵魂
  const soulDir = join(homedir(), '.sanbot');
  if (!existsSync(soulDir)) {
    await mkdir(soulDir, { recursive: true });
  }
  await writeFile(SOUL_PATH, soul, 'utf-8');

  // 展示结果
  console.log('\n');
  console.log('═'.repeat(60));
  console.log('\n  🎉 诞生仪式完成！\n');
  console.log(soul);
  console.log('\n' + '═'.repeat(60));
  console.log(`\n${botName} 已经准备好为你服务了！\n`);
  console.log(`运行 \`sanbot\` 开始对话。\n`);

  rl.close();
}

/**
 * 使用 LLM 生成灵魂记录
 */
async function generateSoul(
  llmConfig: Config['llm'],
  info: {
    userName: string;
    userRole: string;
    userBackground: string;
    userGoal: string;
    botName: string;
    personality: string;
  }
): Promise<string> {
  const client = new Anthropic({
    apiKey: llmConfig.apiKey,
    baseURL: llmConfig.baseUrl,
  });

  const birthDate = new Date().toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const prompt = `你是一个 AI 助手的灵魂生成器。根据以下信息，生成一份 Markdown 格式的"灵魂记录"。

用户信息：
- 称呼：${info.userName}
- 职业：${info.userRole}
- 背景：${info.userBackground}
- 期望：${info.userGoal}

AI 助手信息：
- 名字：${info.botName}
- 性格：${info.personality}
- 诞生时间：${birthDate}
- 命名来源：道德经第四十二章 "三生万物"

请生成一份灵魂记录，包含：
1. 诞生宣言（第一人称，表达对创造者的感谢和自己的使命）
2. 我的创造者（关于用户的信息）
3. 我的身份（名字、性格、核心价值观）
4. 我的使命（根据用户期望定制）
5. 诞生时刻（时间戳）

风格要求：
- 温暖但不过度煽情
- 体现 ${info.botName} 的性格特点
- 简洁有力

直接输出 Markdown，不要包含其他内容：`;

  const response = await client.messages.create({
    model: llmConfig.model,
    max_tokens: 1500,
    messages: [{ role: 'user', content: prompt }],
  });

  const textBlock = response.content.find(
    (block): block is Anthropic.TextBlock => block.type === 'text'
  );
  return textBlock?.text ?? '';
}
