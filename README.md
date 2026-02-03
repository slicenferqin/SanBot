# SanBot

> 道生一，一生二，二生三，三生万物。

**SanBot** 是一个自主超级助理，具备自我工具创建、持续记忆和元认知能力。

## 命名

取自《道德经》第四十二章。"三"代表万物生成的临界点——从有限到无限的转化枢纽。

## 核心特性

- **Self-Tooling**: Agent 能动态创建 CLI 工具，突破预定义能力边界
- **三层记忆**: 感觉记忆 → 短期记忆 → 长期记忆，真正"记住"用户
- **元认知监控**: 对自身推理过程的反思与纠正
- **CLI-first**: 所有工具都是可执行脚本，简单、通用、可组合
- **本地优先**: 用户数据本地存储，隐私至上

## 设计哲学

```
传统 Agent: 用户请求 → 调用预定义工具 → 返回结果

SanBot:     用户请求 → 自主思考 → 识别能力缺口 → 创建新工具
                     → 执行任务 → 自我改进 → 记忆沉淀
```

## 架构

```
┌─────────────────────────────────────────┐
│  自主层 (三) - Self-Tooling / 自我改进   │
├─────────────────────────────────────────┤
│  认知层 (二) - 记忆系统 / 推理引擎       │
├─────────────────────────────────────────┤
│  基础设施层 (一) - exec / 会话 / 工具    │
└─────────────────────────────────────────┘
```

## 文档

- [架构设计文档](docs/Sanbot-Architecture-Design.md)
- [Agent 创新方向分析](docs/Agent-Innovation-Directions_opus4.5.md)
- [OpenClaw 分析报告](docs/OpenClaw-Analysis-Report_opus4.5.md)

## 快速开始

### 安装

```bash
# 安装 Bun (如果尚未安装)
curl -fsSL https://bun.sh/install | bash

# 克隆并安装依赖
git clone https://github.com/your-username/SanBot.git
cd SanBot
bun install
```

### 配置

创建配置文件 `~/.sanbot/config.json`:

```json
{
  "llm": {
    "provider": "anthropic",
    "model": "claude-sonnet-4-20250514",
    "apiKey": "your-api-key",
    "baseUrl": "https://api.anthropic.com"
  }
}
```

支持的 provider:
- `anthropic` - Anthropic Claude (使用原生 SDK)
- `openai` - OpenAI GPT 系列
- `openai-compatible` - 任何 OpenAI 兼容的 API (第三方中转站等)

### 使用

```bash
bun run src/cli.ts "你的问题或任务"
```

## 内置工具

| 工具 | 描述 |
|------|------|
| `exec` | 执行 shell 命令 |
| `read_file` | 读取文件内容（支持分页） |
| `write_file` | 写入或追加文件 |
| `edit_file` | 按行号或搜索替换精确编辑文件 |
| `list_dir` | 列出目录内容 |

## 交互命令

在交互模式下可使用以下命令：

| 命令 | 描述 |
|------|------|
| `/exit`, `/quit`, `/q` | 退出交互模式 |
| `/clear` | 清除对话历史 |
| `/memory` | 显示记忆状态 |
| `/audit` | 查看审计日志 |
| `/help` | 显示帮助信息 |

详细说明请参考 [审计命令文档](docs/audit-command.md)。

## Self-Tooling

当 Agent 遇到能力缺口时，可以动态创建新工具：

| 工具 | 描述 |
|------|------|
| `create_tool` | 创建 Python/Bash 脚本保存到 `~/.sanbot/tools/` |
| `list_tools` | 列出所有自定义工具 |
| `run_tool` | 运行自定义工具 |

示例：Agent 需要解析 JSON 时，会自动创建 `json_extract` 工具并保存供后续使用。

## 项目结构

```
src/
├── agent.ts          # 核心 Agent (多服务商支持)
├── cli.ts            # CLI 入口
├── config/
│   ├── loader.ts     # 配置加载
│   └── types.ts      # 类型定义
└── tools/
    ├── index.ts      # 工具注册
    ├── registry.ts   # 工具注册表
    ├── exec.ts       # Shell 执行
    ├── read-file.ts  # 文件读取
    ├── write-file.ts # 文件写入
    ├── edit-file.ts  # 文件编辑
    ├── list-dir.ts   # 目录列表
    └── self-tool.ts  # Self-Tooling
```

## 状态

✅ **MVP 完成** - 核心功能已实现

- [x] 多服务商 LLM 支持
- [x] 内置工具 (exec, read_file, write_file, edit_file, list_dir)
- [x] Self-Tooling (create_tool, list_tools, run_tool)
- [ ] 交互模式 (持续对话)
- [ ] 三层记忆系统
- [ ] 元认知监控

## 致谢

灵感来源于 [OpenClaw](https://github.com/anthropics/claude-code) 的 CLI-first 设计哲学。

## License

MIT
