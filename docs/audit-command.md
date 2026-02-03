# /audit 命令使用说明

## 功能概述

`/audit` 命令用于在交互模式下查看今天的审计日志，包括所有危险命令的执行记录。

## 使用方法

在 SanBot 交互模式下输入：

```bash
/audit
```

## 显示内容

### 1. 统计信息
- **Total**: 今天的总记录数
- **✅ Approved**: 用户批准执行的命令数
- **❌ Rejected**: 用户拒绝执行的命令数
- **🚫 Auto-blocked**: 系统自动阻止的命令数（critical 级别）

### 2. 按危险级别分类
- 🟢 **Safe**: 安全命令
- 🟡 **Warning**: 警告级别
- 🟠 **Danger**: 危险级别
- 🔴 **Critical**: 严重危险级别

### 3. 详细日志
每条日志包含：
- 时间戳
- 危险级别图标
- 操作结果（批准/拒绝/自动阻止）
- 完整命令
- 危险原因列表
- 执行结果（如果已执行）

## 示例输出

```
📋 Audit Logs (Today)

📊 Statistics:
  Total: 5
  ✅ Approved: 3
  ❌ Rejected: 1
  🚫 Auto-blocked: 1

  By Level:
    🟢 Safe: 0
    🟡 Warning: 2
    🟠 Danger: 1
    🔴 Critical: 2

────────────────────────────────────────────────────────────────────────────────

📝 Detailed Logs:

1:38:59 PM 🟠 ✅ APPROVED
  Command: rm -rf /tmp/test
  Reasons:
    • Deletes files recursively
    • Uses force flag
  Result: ✅ Success (exit code: 0)

1:38:59 PM 🔴 ❌ REJECTED
  Command: sudo rm -rf /
  Reasons:
    • Attempts to delete root directory
    • Requires sudo privileges

1:38:59 PM 🔴 🚫 AUTO_BLOCKED
  Command: dd if=/dev/zero of=/dev/sda
  Reasons:
    • Overwrites disk
    • Destructive operation
```

## 日志存储位置

审计日志存储在：
```
~/.sanbot/audit/YYYY-MM-DD.jsonl
```

每天一个文件，使用 JSONL 格式（每行一个 JSON 对象）。

## 相关命令

- `/help` - 显示所有可用命令
- `/memory` - 显示记忆状态
- `/clear` - 清除对话历史
- `/exit` - 退出交互模式

## 技术实现

- 使用 `getTodayAuditLogs()` 读取今天的日志
- 使用 `getAuditStats()` 计算统计信息
- 支持彩色输出和图标显示
- 自动格式化时间戳和命令信息

## 安全特性

1. **只读操作**: `/audit` 命令只读取日志，不会修改任何数据
2. **按日分割**: 日志按天分割，便于管理和归档
3. **完整记录**: 记录所有危险操作的完整上下文
4. **可追溯**: 包含 sessionId，可追踪操作来源
