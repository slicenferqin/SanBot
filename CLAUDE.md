# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

SanBot is an autonomous super-assistant inspired by Daoist philosophy ("道生一，一生二，二生三，三生万物"). The project transforms traditional tool-calling agents into truly autonomous problem-solving agents that can think independently, create their own tools, and remember users.

**Current Status**: Early-stage design phase - architecture documentation complete, implementation pending.

## Build & Run Commands (Planned)

```bash
bun install              # Install dependencies
bun run src/index.ts     # Run CLI
bun test                 # Run tests (Bun built-in)
```

## Architecture

Three-layer design mirroring Daoist philosophy:

```
┌─────────────────────────────────────────┐
│  自主层 (三) - Self-Tooling / 自我改进   │  Autonomy Layer
├─────────────────────────────────────────┤
│  认知层 (二) - 记忆系统 / 推理引擎       │  Cognition Layer
├─────────────────────────────────────────┤
│  基础设施层 (一) - exec / 会话 / 工具    │  Infrastructure Layer
└─────────────────────────────────────────┘
```

### Layer 1: Infrastructure (基础设施层)
- Session management, concurrency control, failover system
- Tool registry and exec tool for shell command execution

### Layer 2: Cognition (认知层)
- Three-tier memory: L0 (sensory), L1 (short-term), L2 (long-term)
- Reasoning engine and context engineering

### Layer 3: Autonomy (自主层)
- Self-Tooling: dynamically create CLI tools when capability gaps detected
- Meta-cognitive monitoring and confidence assessment

## Tech Stack

| Component | Choice |
|-----------|--------|
| Language | TypeScript |
| Runtime | Bun |
| LLM SDK | Anthropic SDK |

## Planned Directory Structure

```
src/
├── index.ts          # CLI entry point
├── agent.ts          # Agent core logic
├── tools/
│   ├── exec.ts       # Shell execution tool
│   └── self-tool.ts  # Self-tooling implementation
└── utils/
    └── logger.ts     # Audit logging
```

## Core Workflow

```
User input → Agent reasoning → Gap detection → Self-Tooling (if needed) → exec pipeline → Output
```

Tools created by self-tooling are saved to `~/.sanbot/tools/` for reuse.

## Design Principles

1. **Autonomy First**: Solve problems independently without asking users
2. **Local First**: User data stored locally, privacy paramount
3. **Progressive Complexity**: Start simple, add complexity as needed

## Key Documentation

- `docs/Sanbot-Architecture-Design.md` - Complete three-layer architecture design
- `docs/MVP-Plan.md` - MVP scope, goals, and implementation steps
- `docs/Agent-Innovation-Directions_opus4.5.md` - Innovation analysis and design rationale
- `docs/OpenClaw-Analysis-Report_opus4.5.md` - Reference architecture analysis

## MVP Success Criteria

1. Execute shell commands: `sanbot "list files"` → calls exec ls
2. Create tools on demand: `sanbot "parse JSON"` → creates jq wrapper in ~/.sanbot/tools/
3. Reuse created tools in subsequent similar tasks
