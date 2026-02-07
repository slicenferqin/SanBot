#!/bin/bash

# 测试 SanBot 的效果

echo "=== SanBot Demo Test ==="
echo ""
echo "1. Testing basic question..."
echo ""

# 使用 expect 或者直接用 echo 管道
(
  sleep 1
  echo "Tell me about yourself in 2 sentences"
  sleep 3
  echo "/exit"
) | bun run src/index.ts

echo ""
echo "=== Demo Complete ==="
