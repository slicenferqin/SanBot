#!/usr/bin/env bun
/**
 * 迁移脚本 - 将已存在的工具注册到注册中心
 */

import { existsSync } from 'fs';
import { readdir, readFile } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';
import { registerTool } from './tools/tool-registry-center.ts';

const TOOLS_DIR = join(homedir(), '.sanbot', 'tools');

async function migrate() {
  console.log('🔄 Migrating existing tools to registry...\n');

  if (!existsSync(TOOLS_DIR)) {
    console.log('No tools directory found.');
    return;
  }

  const files = await readdir(TOOLS_DIR);
  let migrated = 0;

  for (const file of files) {
    // 跳过隐藏文件和 registry.json
    if (file.startsWith('.') || file === 'registry.json') {
      continue;
    }

    const toolPath = join(TOOLS_DIR, file);
    const content = await readFile(toolPath, 'utf-8');

    // 检测语言
    let language: 'python' | 'bash' = 'bash';
    if (content.startsWith('#!/usr/bin/env python') || content.includes('import ')) {
      language = 'python';
    }

    // 尝试从代码中提取描述
    let description = `自创建工具: ${file}`;
    const docMatch = content.match(/"""([\s\S]*?)"""|'''([\s\S]*?)'''|# (.+)/);
    if (docMatch) {
      const summary = (docMatch[1] || docMatch[2] || docMatch[3] || '').trim();
      description = summary.split('\n')[0] || description;
    }

    const now = new Date().toISOString();
    await registerTool({
      name: file,
      description,
      language,
      schema: {
        type: 'object',
        properties: {
          args: {
            type: 'string',
            description: '命令行参数',
          },
        },
      },
      createdAt: now,
      updatedAt: now,
    });

    console.log(`  ✅ ${file} (${language})`);
    migrated++;
  }

  console.log(`\n📦 Migrated ${migrated} tools to registry.`);
}

migrate().catch(console.error);
