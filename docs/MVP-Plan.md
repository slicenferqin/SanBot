# SanBot MVP 计划

## MVP 目标

验证核心假设：**Agent 能通过 exec 执行命令，并在能力不足时自己创建 CLI 工具**。

不是做一个完整的产品，而是做一个能跑通核心流程的 PoC。

---

## 核心验证点

| # | 假设 | 验证方式 |
|---|------|---------|
| 1 | exec 是能力扩展的基础 | Agent 能通过 exec 完成各种任务 |
| 2 | Self-Tooling 可行 | Agent 能识别缺口、生成 CLI 工具、执行并复用 |
| 3 | CLI-first 足够简单 | 不需要 MCP 等协议，直接 shell 调用 |

---

## MVP 范围

### 必须有 (Must Have)

```
┌─────────────────────────────────────────────────────────────┐
│                      MVP 核心组件                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. CLI 入口                                                │
│     sanbot "帮我分析这个 CSV 文件"                          │
│                                                             │
│  2. LLM 对话核心                                            │
│     - 调用 Claude API                                       │
│     - 流式输出                                              │
│     - 工具调用解析                                          │
│                                                             │
│  3. exec 工具                                               │
│     - 执行任意 shell 命令                                   │
│     - 捕获 stdout/stderr                                    │
│     - 超时控制                                              │
│                                                             │
│  4. Self-Tooling (简化版)                                   │
│     - 识别能力缺口                                          │
│     - 生成 CLI 脚本 (Python/Bash)                           │
│     - 保存到 ~/.sanbot/tools/                               │
│     - 设置可执行权限                                        │
│     - 后续任务可复用                                        │
│                                                             │
│  5. 审计日志                                                │
│     - 记录所有命令执行                                      │
│     - 记录工具创建                                          │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 不需要 (Won't Have)

- ❌ 三层记忆系统（用简单文件记录代替）
- ❌ 元认知监控
- ❌ 自我改进
- ❌ 多渠道接入
- ❌ Web UI
- ❌ 会话管理（单会话即可）
- ❌ 并发控制
- ❌ 容错机制

---

## 技术选型 (MVP 精简版)

| 组件 | 选择 | 理由 |
|------|------|------|
| 语言 | TypeScript | 类型安全，生态好 |
| 运行时 | Bun | 快，原生 TS 支持，自带测试 |
| LLM SDK | **Vercel AI SDK** | 统一接口，支持多服务商切换 |
| CLI 框架 | 无（直接 process.argv） | MVP 不需要复杂 CLI |
| 日志 | console + 文件 | 简单够用 |

### LLM 多服务商支持

MVP 必须支持多服务商，降低对单一 API 的依赖：

```typescript
// 配置文件: ~/.sanbot/config.json
{
  "llm": {
    "provider": "openai-compatible",  // anthropic | openai | openai-compatible
    "model": "claude-sonnet-4-20250514",
    "apiKey": "sk-xxx",               // 或从环境变量 SANBOT_API_KEY 读取
    "baseUrl": null,                  // 自定义 endpoint（中转站必填）
    "headers": {}                     // 自定义请求头（部分中转站需要）
  }
}
```

**支持的 Provider 类型**：

| Provider | 用途 | baseUrl |
|----------|------|---------|
| `anthropic` | Anthropic 官方 API | 可选，默认官方 |
| `openai` | OpenAI 官方 API | 可选，默认官方 |
| `openai-compatible` | **任意 OpenAI 兼容 API** | **必填** |

**常见中转站配置示例**：

```typescript
// OpenRouter
{
  "llm": {
    "provider": "openai-compatible",
    "model": "anthropic/claude-sonnet-4",
    "baseUrl": "https://openrouter.ai/api/v1",
    "apiKey": "sk-or-xxx",
    "headers": {
      "HTTP-Referer": "https://github.com/user/sanbot",
      "X-Title": "SanBot"
    }
  }
}

// API2D
{
  "llm": {
    "provider": "openai-compatible",
    "model": "gpt-4o",
    "baseUrl": "https://api.api2d.com/v1",
    "apiKey": "fk-xxx"
  }
}

// OneAPI / New API (自建中转)
{
  "llm": {
    "provider": "openai-compatible",
    "model": "claude-3-5-sonnet",
    "baseUrl": "https://your-oneapi.com/v1",
    "apiKey": "sk-xxx"
  }
}

// Ollama 本地
{
  "llm": {
    "provider": "openai-compatible",
    "model": "llama3.2",
    "baseUrl": "http://localhost:11434/v1",
    "apiKey": "ollama"  // Ollama 不验证，随便填
  }
}

// DeepSeek 官方
{
  "llm": {
    "provider": "openai-compatible",
    "model": "deepseek-chat",
    "baseUrl": "https://api.deepseek.com/v1",
    "apiKey": "sk-xxx"
  }
}
```

**实现方案**：统一使用 OpenAI 兼容接口

```typescript
// src/llm/provider.ts
import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';

interface LLMConfig {
  provider: 'anthropic' | 'openai' | 'openai-compatible';
  model: string;
  apiKey?: string;
  baseUrl?: string;
  headers?: Record<string, string>;
}

export function getProvider(config: LLMConfig) {
  const apiKey = config.apiKey || process.env.SANBOT_API_KEY;

  switch (config.provider) {
    case 'anthropic':
      return createAnthropic({
        apiKey,
        baseURL: config.baseUrl,  // 支持 Anthropic 中转
        headers: config.headers,
      })(config.model);

    case 'openai':
      return createOpenAI({
        apiKey,
        baseURL: config.baseUrl,
        headers: config.headers,
      })(config.model);

    case 'openai-compatible':
      // 通用 OpenAI 兼容接口，支持任意中转站
      if (!config.baseUrl) {
        throw new Error('openai-compatible provider requires baseUrl');
      }
      return createOpenAI({
        apiKey,
        baseURL: config.baseUrl,
        headers: config.headers,
      })(config.model);

    default:
      throw new Error(`Unknown provider: ${config.provider}`);
  }
}
```

**配置优先级**：
1. 配置文件中的 `apiKey`
2. 环境变量 `SANBOT_API_KEY`
3. Provider 特定环境变量（`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`）

---

## 目录结构

```
SanBot/
├── src/
│   ├── index.ts          # CLI 入口
│   ├── agent.ts          # Agent 核心逻辑
│   ├── llm/
│   │   ├── provider.ts   # 多服务商适配
│   │   └── types.ts      # LLM 相关类型
│   ├── tools/
│   │   ├── index.ts      # 工具注册表
│   │   ├── exec.ts       # exec 工具实现
│   │   ├── read-file.ts  # 文件读取
│   │   ├── write-file.ts # 文件写入
│   │   ├── edit-file.ts  # 文件编辑
│   │   ├── list-dir.ts   # 目录列表
│   │   └── self-tool.ts  # Self-Tooling 实现
│   ├── config/
│   │   └── loader.ts     # 配置加载
│   └── utils/
│       └── logger.ts     # 审计日志
├── docs/                 # 文档
├── package.json
├── tsconfig.json
└── README.md
```

---

## 内置工具设计

### 为什么不能只有 exec？

纯 `exec` 方案的问题：

| 操作 | exec 方式 | 问题 |
|------|-----------|------|
| 读文件 | `cat file.txt` | 大文件会爆 context window |
| 写文件 | `echo "..." > file` | 转义噩梦，多行内容难处理 |
| 编辑文件 | `sed -i 's/old/new/'` | LLM 难以精确控制正则 |
| 列目录 | `ls -la` | 输出格式不结构化 |

### MVP 内置工具集

```
┌─────────────────────────────────────────────────────────────┐
│                    MVP 内置工具                              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  核心工具 (必须)                                            │
│  ├── exec          执行任意 shell 命令                      │
│  ├── read_file     读取文件内容（支持分页、行号范围）        │
│  └── write_file    写入/创建文件                            │
│                                                             │
│  辅助工具 (建议)                                            │
│  ├── edit_file     精确编辑文件（基于行号或搜索替换）        │
│  └── list_dir      列出目录内容（结构化输出）               │
│                                                             │
│  扩展工具 (MVP 后)                                          │
│  ├── web_fetch     获取网页内容                             │
│  ├── web_search    搜索引擎查询                             │
│  └── ...           通过 Self-Tooling 动态创建               │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 工具详细设计

#### 1. exec - 命令执行

```typescript
interface ExecTool {
  name: 'exec';
  description: '执行 shell 命令，获取 stdout/stderr';
  parameters: {
    command: string;      // 要执行的命令
    cwd?: string;         // 工作目录，默认当前目录
    timeout?: number;     // 超时毫秒数，默认 30000
  };
  returns: {
    stdout: string;
    stderr: string;
    exitCode: number;
  };
}
```

**安全考虑**：
- MVP 阶段信任用户输入
- 记录所有执行的命令到审计日志
- 后续版本添加危险命令确认机制

#### 2. read_file - 文件读取

```typescript
interface ReadFileTool {
  name: 'read_file';
  description: '读取文件内容，支持分页避免 context 爆炸';
  parameters: {
    path: string;         // 文件路径
    startLine?: number;   // 起始行号（1-based），默认 1
    endLine?: number;     // 结束行号，默认读到文件末尾
    maxLines?: number;    // 最大行数，默认 500
  };
  returns: {
    content: string;      // 文件内容
    totalLines: number;   // 文件总行数
    truncated: boolean;   // 是否被截断
  };
}
```

**为什么需要**：
- `cat` 大文件会占满 context window
- 支持分页读取，按需获取内容
- 返回元信息帮助 Agent 决策

#### 3. write_file - 文件写入

```typescript
interface WriteFileTool {
  name: 'write_file';
  description: '写入文件，自动创建目录';
  parameters: {
    path: string;         // 文件路径
    content: string;      // 文件内容
    mode?: 'overwrite' | 'append';  // 写入模式，默认 overwrite
  };
  returns: {
    success: boolean;
    bytesWritten: number;
  };
}
```

**为什么需要**：
- 避免 shell 转义问题（引号、特殊字符）
- 多行内容写入更可靠
- 自动创建父目录

#### 4. edit_file - 文件编辑

```typescript
interface EditFileTool {
  name: 'edit_file';
  description: '精确编辑文件内容';
  parameters: {
    path: string;
    edits: Array<{
      // 方式一：按行号编辑
      startLine?: number;
      endLine?: number;
      newContent: string;
    } | {
      // 方式二：搜索替换
      search: string;
      replace: string;
      all?: boolean;      // 是否替换所有匹配，默认 false
    }>;
  };
  returns: {
    success: boolean;
    changesApplied: number;
  };
}
```

**为什么需要**：
- `sed` 对 LLM 来说太难精确控制
- 支持多种编辑方式，灵活性高
- 原子操作，要么全部成功要么全部失败

#### 5. list_dir - 目录列表

```typescript
interface ListDirTool {
  name: 'list_dir';
  description: '列出目录内容，结构化输出';
  parameters: {
    path: string;         // 目录路径
    recursive?: boolean;  // 是否递归，默认 false
    maxDepth?: number;    // 最大递归深度，默认 3
    pattern?: string;     // glob 过滤模式
  };
  returns: {
    entries: Array<{
      name: string;
      type: 'file' | 'directory' | 'symlink';
      size: number;
      modified: string;   // ISO 时间戳
    }>;
  };
}
```

**为什么需要**：
- `ls` 输出是纯文本，需要解析
- 结构化数据便于 Agent 处理
- 支持过滤和递归

### 工具 vs Self-Tooling 的边界

```
┌─────────────────────────────────────────────────────────────┐
│                  工具选择决策树                              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  任务需求                                                   │
│      │                                                      │
│      ▼                                                      │
│  ┌─────────────────────┐                                   │
│  │ 内置工具能完成吗？   │                                   │
│  └─────────────────────┘                                   │
│      │                                                      │
│      ├── 是 → 使用内置工具                                  │
│      │                                                      │
│      └── 否 → exec + 系统命令能完成吗？                     │
│                  │                                          │
│                  ├── 是 → 使用 exec                         │
│                  │                                          │
│                  └── 否 → Self-Tooling 创建新工具           │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Self-Tooling 的定位**：
- 不是替代内置工具
- 是扩展能力边界的机制
- 用于处理特定领域任务（如 CSV 解析、数据转换等）

---

## 核心流程

```
┌─────────────────────────────────────────────────────────────┐
│                      MVP 核心流程                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  用户: sanbot "分析 sales.csv 的月度趋势"                   │
│                                                             │
│         │                                                   │
│         ▼                                                   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Agent 思考:                                          │   │
│  │ 1. 需要读取 CSV 文件 → 用 exec: cat sales.csv        │   │
│  │ 2. 需要解析 CSV → 检查 ~/.sanbot/tools/csv_parse    │   │
│  │    - 不存在 → 创建工具                               │   │
│  │ 3. 需要计算趋势 → 检查 ~/.sanbot/tools/trend        │   │
│  │    - 不存在 → 创建工具                               │   │
│  │ 4. 执行分析流程                                      │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│         │                                                   │
│         ▼                                                   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Self-Tooling:                                        │   │
│  │                                                     │   │
│  │ 1. 生成 csv_parse 工具:                             │   │
│  │    #!/usr/bin/env python3                           │   │
│  │    import csv, json, sys                            │   │
│  │    ...                                              │   │
│  │                                                     │   │
│  │ 2. 保存到 ~/.sanbot/tools/csv_parse                 │   │
│  │ 3. chmod +x                                         │   │
│  │ 4. 测试执行                                         │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│         │                                                   │
│         ▼                                                   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ 执行任务:                                            │   │
│  │                                                     │   │
│  │ exec: cat sales.csv | ~/.sanbot/tools/csv_parse \   │   │
│  │       | ~/.sanbot/tools/trend --group-by=month      │   │
│  │                                                     │   │
│  │ 输出结果给用户                                       │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 实施步骤

### Step 1: 项目初始化

- [ ] 初始化 Bun 项目
- [ ] 配置 TypeScript
- [ ] 安装依赖：`@ai-sdk/anthropic`, `@ai-sdk/openai`, `ai`
- [ ] 创建目录结构
- [ ] 实现配置加载 (`~/.sanbot/config.json`)

### Step 2: LLM 多服务商适配

- [ ] 实现 provider 抽象层
- [ ] 支持 Anthropic/OpenAI/DeepSeek/Ollama
- [ ] 实现流式输出
- [ ] 实现工具调用解析

### Step 3: 内置工具实现

- [ ] 实现 exec 工具（超时、stdout/stderr 捕获）
- [ ] 实现 read_file 工具（分页、行号范围）
- [ ] 实现 write_file 工具（自动创建目录）
- [ ] 实现 edit_file 工具（行号编辑、搜索替换）
- [ ] 实现 list_dir 工具（结构化输出）
- [ ] 实现工具注册表

### Step 4: Agent 核心

- [ ] 实现 Agent 主循环
- [ ] 实现工具调用分发
- [ ] 实现对话历史管理
- [ ] 审计日志记录

### Step 5: Self-Tooling

- [ ] 实现能力缺口检测
- [ ] 实现 CLI 脚本生成
- [ ] 实现工具保存和权限设置
- [ ] 实现工具复用检查

### Step 6: CLI 入口

- [ ] 实现命令行入口
- [ ] 支持交互模式
- [ ] 支持单次执行模式
- [ ] 支持配置初始化 (`sanbot init`)

### Step 7: 测试验证

- [ ] 测试各内置工具
- [ ] 测试多服务商切换
- [ ] 测试 Self-Tooling 流程
- [ ] 端到端测试

---

## 成功标准

MVP 完成的标志：

1. **能执行**: `sanbot "列出当前目录的文件"` → 调用 list_dir 或 exec ls
2. **能读写**: `sanbot "读取 config.json 并修改 port 为 8080"` → read_file + edit_file
3. **能切换服务商**: 修改 config.json 的 provider，无需改代码
4. **能创建工具**: `sanbot "解析这个 JSON 文件并提取所有 name 字段"` → 创建 jq 包装工具
5. **能复用**: 第二次执行类似任务时，直接使用已创建的工具

---

## 风险与缓解

| 风险 | 缓解措施 |
|------|---------|
| LLM 生成的工具代码有 bug | 执行前先测试，失败则重新生成 |
| 工具创建太慢影响体验 | 先用 exec + 现有工具，必要时才创建 |
| 安全问题 | MVP 阶段信任用户，后续加确认机制 |

---

## 后续迭代

MVP 验证成功后，按优先级迭代：

1. **记忆系统**: 让 Agent 记住用户和上下文
2. **危险操作确认**: 删除、网络等操作需用户确认
3. **交互式模式优化**: 更好的 CLI 体验
4. **多轮对话**: 支持上下文连续对话
