import { existsSync } from 'fs';
import { readdir, readFile } from 'fs/promises';
import { join, basename } from 'path';

export interface RuntimeContext {
  root: string;
  packageName?: string;
  scripts?: string[];
  docs?: string[];
  hot: string[];
  warm: string[];
  cold: string[];
}

const IMPORTANT_FILES = ['README.md', 'CLAUDE.md', 'package.json', 'tsconfig.json'];
const COMMON_DIRS = ['src', 'docs', 'scripts', 'tests', 'packages'];

async function safeReadJson(path: string): Promise<any | null> {
  try {
    const text = await readFile(path, 'utf-8');
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function readHeadLines(path: string, limit: number = 5): Promise<string[]> {
  try {
    const content = await readFile(path, 'utf-8');
    return content
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean)
      .slice(0, limit);
  } catch {
    return [];
  }
}

export async function gatherRuntimeContext(root: string = process.cwd()): Promise<RuntimeContext> {
  const entries = await readdir(root, { withFileTypes: true });
  const hot: string[] = [];
  const warm: string[] = [];
  const cold: string[] = [];

  const packageJsonPath = join(root, 'package.json');
  let packageName: string | undefined;
  let scripts: string[] | undefined;
  if (existsSync(packageJsonPath)) {
    const pkg = await safeReadJson(packageJsonPath);
    if (pkg) {
      packageName = pkg.name;
      if (pkg.scripts) {
        scripts = Object.keys(pkg.scripts).slice(0, 6);
      }
    }
  }

  for (const file of IMPORTANT_FILES) {
    const filePath = join(root, file);
    if (existsSync(filePath)) {
      const lines = await readHeadLines(filePath, 3);
      if (lines.length) {
        hot.push(`${file}: ${lines.join(' / ')}`);
      } else {
        hot.push(`${file} present`);
      }
    }
  }

  const docSummary: string[] = [];
  const directories: string[] = [];
  for (const entry of entries) {
    if (entry.isDirectory()) {
      directories.push(entry.name);
    }
  }

  directories.sort();
  const hotDirs = directories.filter(dir => COMMON_DIRS.includes(dir));
  if (hotDirs.length) {
    warm.push(`Key directories: ${hotDirs.slice(0, 5).join(', ')}`);
  }

  const otherDirs = directories.filter(dir => !COMMON_DIRS.includes(dir));
  if (otherDirs.length) {
    cold.push(`Additional directories: ${otherDirs.slice(0, 8).join(', ')}`);
  }

  const docsDir = join(root, 'docs');
  if (existsSync(docsDir)) {
    try {
      const docEntries = await readdir(docsDir);
      docSummary.push(...docEntries.slice(0, 5));
    } catch {
      // ignore
    }
  }

  return {
    root,
    packageName,
    scripts,
    docs: docSummary,
    hot,
    warm,
    cold,
  };
}

export function formatRuntimeContext(ctx: RuntimeContext): string {
  const sections: string[] = [];
  const workspaceLines = [
    `- Root: ${ctx.root}`,
    `- Project: ${ctx.packageName || basename(ctx.root)}`,
  ];
  if (ctx.scripts && ctx.scripts.length) {
    workspaceLines.push(`- Scripts: ${ctx.scripts.join(', ')}`);
  }
  sections.push(`### Workspace Snapshot\n${workspaceLines.join('\n')}`);

  if (ctx.hot.length) {
    sections.push(`### Hot Context\n${ctx.hot.map(item => `- ${item}`).join('\n')}`);
  }
  if (ctx.warm.length) {
    sections.push(`### Warm Context\n${ctx.warm.map(item => `- ${item}`).join('\n')}`);
  }
  if (ctx.cold.length) {
    sections.push(`### Cold Context\n${ctx.cold.map(item => `- ${item}`).join('\n')}`);
  }
  if (ctx.docs && ctx.docs.length) {
    sections.push(`### Docs Index\n${ctx.docs.map(doc => `- ${doc}`).join('\n')}`);
  }

  return `## Runtime Context\n\n${sections.join('\n\n')}`;
}
