# TUI 功能快速参考

## 流式输出

### 使用方法
流式输出已默认启用，无需额外配置。

### 效果
- 文本响应实时逐字显示
- 减少等待焦虑
- 提供即时反馈

### 示例
```bash
$ sanbot "Write a poem about coding"
🤖 SanBot is thinking...

Code flows like rivers... [逐字显示]
```

---

## 工具调用状态

### 显示格式
```
🔧 Calling <tool_name>...
✅ <tool_name> completed (<time>)
```

或失败时：
```
🔧 Calling <tool_name>...
❌ <tool_name> failed (<time>): <error>
```

### 时间格式
- 小于 1 秒: `123ms`
- 大于 1 秒: `1.2s`

### 示例
```bash
$ sanbot "use read_file to read package.json"
🤖 SanBot is thinking...

📦 Loaded 6 custom tools from registry
🔧 Calling read_file...
✅ read_file completed (1ms)
[响应内容...]
```

---

## TTY 检测

### 自动降级
- **TTY 环境** (终端): 显示动态 spinner 和彩色输出
- **非 TTY 环境** (管道/重定向): 使用简单文本输出

### 示例
```bash
# TTY 环境 - 显示动画
$ sanbot "hello"

# 非 TTY 环境 - 简单文本
$ sanbot "hello" > output.txt
$ echo "hello" | sanbot
```

---

## 彩色输出

### 当前支持
- 🟡 黄色: 工具调用中 (Calling)
- 🟢 绿色: 成功状态
- 🔴 红色: 失败状态
- ⚪ 灰色: 辅助信息 (时间、参数)

### 禁用彩色
```bash
# 设置 NO_COLOR 环境变量
NO_COLOR=1 sanbot "hello"
```

---

## 性能

### 流式输出
- 延迟: < 100ms
- 内存: 最小化缓冲

### 工具调用
- 计时精度: 毫秒级
- 开销: < 1ms

---

## 已知限制

1. **流式输出**: 仅支持文本内容，工具调用时会暂停流式
2. **Spinner**: 在非 TTY 环境下降级为简单文本
3. **彩色输出**: 依赖终端支持 ANSI 转义码

---

## 故障排除

### 问题: 看不到流式效果
**原因**: 可能是非 TTY 环境或输出被缓冲

**解决方案**:
```bash
# 确保在终端中直接运行
sanbot "your message"

# 而不是
echo "your message" | sanbot
```

### 问题: Spinner 不显示
**原因**: 非 TTY 环境

**解决方案**: 这是正常行为，会自动降级为简单文本输出

### 问题: 彩色输出不显示
**原因**: 终端不支持 ANSI 转义码或设置了 NO_COLOR

**解决方案**:
```bash
# 检查 NO_COLOR 环境变量
echo $NO_COLOR

# 如果设置了，取消设置
unset NO_COLOR
```

---

## 开发者参考

### 使用 TUI 组件

```typescript
import { ToolSpinner, StreamWriter } from './tui/index.ts';

// 创建 spinner
const spinner = new ToolSpinner();
spinner.start('my_tool', { param: 'value' });
// ... 执行工具 ...
spinner.success('my_tool');

// 创建流式写入器
const writer = new StreamWriter();
writer.write('Hello ');
writer.write('World');
writer.end();
```

### 扩展 TUI

1. 在 `src/tui/` 目录下创建新模块
2. 在 `src/tui/index.ts` 中导出
3. 在 `Agent` 类中使用

---

## 更新日志

### v0.1.0 (2026-02-03)
- ✅ 实现流式输出
- ✅ 实现工具调用状态显示
- ✅ 添加 TTY 检测和自动降级
- ✅ 添加彩色输出支持
- ✅ 添加精确计时功能
