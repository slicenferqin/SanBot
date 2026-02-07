#!/bin/bash
# 测试 TUI-PI 实现

echo "Testing SanBot TUI-PI..."
echo ""
echo "This will start SanBot in interactive mode."
echo "Try typing a message and pressing Enter."
echo "Press Ctrl+C twice to exit."
echo ""

~/.bun/bin/bun run src/index.ts
