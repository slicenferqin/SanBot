# SanBot WebUI 设计文档 v2

> 设计理念：「道生万物」—— 从简到繁的渐进式展示

## 1. 设计审阅与优化

### 1.1 原方案问题识别

| 问题 | 影响 | 优化方案 |
|------|------|----------|
| 会话列表默认收起 | 多会话用户切换不便 | 记住用户偏好，首次访问展开 |
| 仅深色主题 | 部分用户不适应 | 支持浅/深双主题 + 跟随系统 |
| 工具调用内嵌过长 | 打断阅读流 | 超过3个自动折叠，显示摘要 |
| 文件变更需点击查看 | 增加操作步骤 | 重要变更自动预览，次要折叠 |
| 缺少键盘快捷键 | 效率用户受限 | 添加完整快捷键系统 |
| 未考虑移动端 | 移动访问体验差 | 响应式设计 + 手势支持 |
| 缺少空/错误/加载状态 | 边界情况体验差 | 完善所有状态设计 |
| 字体加载失败 | 视觉降级 | 定义完整字体栈 |

### 1.2 用户场景分析

**主要用户画像**：
1. **开发者** - 需要快速执行命令、查看代码变更
2. **探索者** - 想了解 AI 在做什么，需要透明度
3. **效率用户** - 依赖键盘，讨厌鼠标点击

**核心场景**：
- 发送指令 → 等待执行 → 查看结果
- 监控工具调用进度
- 审查文件变更
- 切换/管理多个会话

---

## 2. 信息架构

```
SanBot WebUI
├── 顶部导航栏 (64px)
│   ├── Logo + 标题
│   ├── 全局搜索 (⌘K)
│   ├── 连接状态
│   └── 设置入口
│
├── 主内容区
│   ├── 侧边栏 (可折叠, 280px)
│   │   ├── 新建会话按钮
│   │   ├── 会话列表
│   │   │   ├── 今天
│   │   │   ├── 昨天
│   │   │   └── 更早
│   │   └── 底部：主题切换 + 帮助
│   │
│   └── 对话区域 (flex: 1)
│       ├── 消息流
│       │   ├── 用户消息
│       │   ├── AI 回复
│       │   │   ├── 文本内容
│       │   │   └── 工具调用区块 (内嵌)
│       │   └── 系统消息
│       │
│       └── 输入区域 (固定底部)
│           ├── 文本输入框
│           ├── 附件按钮
│           └── 发送按钮
│
└── 右侧抽屉 (按需, 400px)
    ├── 文件变更详情
    ├── 工具输出详情
    └── 设置面板
```

---

## 3. 布局设计

### 3.1 响应式断点

```
Desktop:  ≥1200px  侧边栏展开 + 抽屉可用
Tablet:   768-1199px  侧边栏收起为图标 + 抽屉覆盖
Mobile:   <768px   底部导航 + 全屏抽屉
```

### 3.2 桌面端布局 (≥1200px)

```
┌──────────────────────────────────────────────────────────────────┐
│ [menu] SanBot           [search] ⌘K 搜索    [wifi]● [settings]  │  64px
├────────────┬─────────────────────────────────────────────────────┤
│            │                                                     │
│ [plus]新会话│                     对话区域                        │
│            │                                                     │
│ ─────────  │  ┌───────────────────────────────────────────────┐ │
│ 今天       │  │ [user] You                           10:30 AM │ │
│  ├ 会话1 ● │  │  重构 webui                                   │ │
│  └ 会话2   │  └───────────────────────────────────────────────┘ │
│            │                                                     │
│ 昨天       │  ┌───────────────────────────────────────────────┐ │
│  └ 会话3   │  │ [bot] SanBot                         10:30 AM │ │
│            │  │                                               │ │
│            │  │  我来帮你重构 WebUI...                        │ │
│            │  │                                               │ │
│            │  │  ┌─ 工具调用 (2/4) ────────────────────────┐  │ │
│            │  │  │[check][file-text] read  index.html 0.1s│  │ │
│            │  │  │[loader-2][terminal] exec bun test running│ │ │
│            │  │  │[circle][file-plus] write new.html pending│ │ │
│            │  │  │[circle][terminal] exec  git add  pending│  │ │
│            │  │  └────────────────────────────────────────┘  │ │
│            │  └───────────────────────────────────────────────┘ │
│ ─────────  │                                                     │
│[moon][help]├─────────────────────────────────────────────────────┤
│   280px    │  [输入消息，⌘↵ 发送...]       [paperclip] [send]   │  72px
└────────────┴─────────────────────────────────────────────────────┘
```

### 3.3 移动端布局 (<768px)

```
┌─────────────────────────┐
│  SanBot       ●  [menu] │  56px
├─────────────────────────┤
│                         │
│      对话区域           │
│      (全屏)             │
│                         │
├─────────────────────────┤
│  [输入...] [paperclip][send] │  60px
├─────────────────────────┤
│ [message-square][wrench][settings] │  56px 底部导航
└─────────────────────────┘
```


---

## 4. 视觉设计

### 4.1 配色系统

#### 深色主题 (默认)

```css
:root[data-theme="dark"] {
  /* 背景层次 */
  --bg-base: #0d1117;        /* 最底层背景 */
  --bg-surface: #161b22;     /* 卡片/面板背景 */
  --bg-elevated: #21262d;    /* 悬浮元素背景 */
  --bg-overlay: #30363d;     /* 遮罩背景 */
  
  /* 文字层次 */
  --text-primary: #e6edf3;   /* 主要文字 */
  --text-secondary: #8b949e; /* 次要文字 */
  --text-tertiary: #6e7681;  /* 辅助文字 */
  --text-disabled: #484f58;  /* 禁用文字 */
  
  /* 语义色 */
  --accent-primary: #58a6ff; /* 主强调色 - 链接/按钮 */
  --accent-success: #3fb950; /* 成功 */
  --accent-warning: #d29922; /* 警告/进行中 */
  --accent-error: #f85149;   /* 错误 */
  --accent-info: #a371f7;    /* 信息 */
  
  /* 边框 */
  --border-default: #30363d;
  --border-muted: #21262d;
  --border-emphasis: #8b949e;
  
  /* 特殊 */
  --user-bubble: #1f3a5f;    /* 用户消息背景 */
  --ai-bubble: #21262d;      /* AI消息背景 */
  --tool-bg: #161b22;        /* 工具调用背景 */
}
```

#### 浅色主题

```css
:root[data-theme="light"] {
  --bg-base: #ffffff;
  --bg-surface: #f6f8fa;
  --bg-elevated: #ffffff;
  --bg-overlay: #e6edf3;
  
  --text-primary: #1f2328;
  --text-secondary: #656d76;
  --text-tertiary: #8b949e;
  --text-disabled: #b1bac4;
  
  --accent-primary: #0969da;
  --accent-success: #1a7f37;
  --accent-warning: #9a6700;
  --accent-error: #d1242f;
  --accent-info: #8250df;
  
  --border-default: #d1d9e0;
  --border-muted: #e6edf3;
  --border-emphasis: #8b949e;
  
  --user-bubble: #ddf4ff;
  --ai-bubble: #f6f8fa;
  --tool-bg: #f6f8fa;
}
```

### 4.2 字体系统

```css
:root {
  /* 字体族 */
  --font-sans: "Inter", "SF Pro Display", -apple-system, BlinkMacSystemFont, 
               "Noto Sans SC", "PingFang SC", sans-serif;
  --font-mono: "JetBrains Mono", "Fira Code", "SF Mono", 
               "Cascadia Code", monospace;
  --font-display: "LXGW WenKai", "Noto Serif SC", serif; /* 可选：标题装饰 */
  
  /* 字号 */
  --text-xs: 0.75rem;    /* 12px */
  --text-sm: 0.875rem;   /* 14px */
  --text-base: 1rem;     /* 16px */
  --text-lg: 1.125rem;   /* 18px */
  --text-xl: 1.25rem;    /* 20px */
  --text-2xl: 1.5rem;    /* 24px */
  
  /* 行高 */
  --leading-tight: 1.25;
  --leading-normal: 1.5;
  --leading-relaxed: 1.75;
  
  /* 字重 */
  --font-normal: 400;
  --font-medium: 500;
  --font-semibold: 600;
  --font-bold: 700;
}
```

### 4.3 间距系统

```css
:root {
  --space-1: 0.25rem;   /* 4px */
  --space-2: 0.5rem;    /* 8px */
  --space-3: 0.75rem;   /* 12px */
  --space-4: 1rem;      /* 16px */
  --space-5: 1.25rem;   /* 20px */
  --space-6: 1.5rem;    /* 24px */
  --space-8: 2rem;      /* 32px */
  --space-10: 2.5rem;   /* 40px */
  --space-12: 3rem;     /* 48px */
}
```

### 4.4 圆角与阴影

```css
:root {
  /* 圆角 */
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-xl: 16px;
  --radius-full: 9999px;
  
  /* 阴影 (深色主题) */
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.3);
  --shadow-md: 0 4px 8px rgba(0, 0, 0, 0.4);
  --shadow-lg: 0 8px 24px rgba(0, 0, 0, 0.5);
  --shadow-xl: 0 16px 48px rgba(0, 0, 0, 0.6);
}
```

### 4.5 图标系统

#### 图标库选择：Lucide Icons

选择 [Lucide](https://lucide.dev/) 作为图标库，理由：
- 开源免费，MIT 协议
- 设计精美，线条一致（2px 描边，圆角端点）
- 体积小，按需引入（每个图标 ~300 bytes）
- 支持 SVG sprite 或内联

#### 引入方式

```html
<!-- 方式1: CDN (推荐，简单) -->
<script src="https://unpkg.com/lucide@latest"></script>
<script>lucide.createIcons();</script>

<!-- 方式2: SVG Sprite (离线可用) -->
<svg class="icon"><use href="#icon-name"></use></svg>
```

#### 图标映射表

**导航与操作**

| 用途 | 图标名 | 说明 |
|------|--------|------|
| 菜单 | `menu` | 侧边栏切换 |
| 搜索 | `search` | 全局搜索 |
| 设置 | `settings` | 设置入口 |
| 新建 | `plus` | 新建会话 |
| 关闭 | `x` | 关闭抽屉/弹窗 |
| 发送 | `send` | 发送消息 |
| 附件 | `paperclip` | 添加附件 |
| 复制 | `copy` | 复制内容 |
| 删除 | `trash-2` | 删除会话/消息 |
| 编辑 | `pencil` | 编辑消息 |
| 更多 | `more-horizontal` | 更多操作 |
| 展开 | `chevron-down` | 展开折叠 |
| 折叠 | `chevron-up` | 收起折叠 |
| 外链 | `external-link` | 在编辑器打开 |

**角色标识**

| 用途 | 图标名 | 说明 |
|------|--------|------|
| 用户 | `user` | 用户消息头像 |
| AI | `bot` | AI 消息头像 |
| 系统 | `info` | 系统消息 |

**工具类型**

| 工具 | 图标名 | 说明 |
|------|--------|------|
| 执行命令 | `terminal` | exec / shell |
| 读取文件 | `file-text` | read |
| 写入文件 | `file-plus` | write |
| 编辑文件 | `file-edit` | edit |
| 搜索文件 | `folder-search` | glob / grep |
| 网络请求 | `globe` | fetch / web |
| 代码 | `code` | 通用代码操作 |

**状态指示**

| 状态 | 图标名 | 颜色变量 | 说明 |
|------|--------|----------|------|
| 成功 | `check` | `--accent-success` | 完成 |
| 进行中 | `loader-2` | `--accent-warning` | 加载中 (旋转动画) |
| 等待 | `circle` | `--text-tertiary` | 待执行 |
| 失败 | `x` | `--accent-error` | 错误 |
| 已连接 | `wifi` | `--accent-success` | 连接正常 |
| 断开 | `wifi-off` | `--accent-error` | 连接断开 |

**主题切换**

| 主题 | 图标名 | 说明 |
|------|--------|------|
| 深色 | `moon` | 切换到深色 |
| 浅色 | `sun` | 切换到浅色 |
| 跟随系统 | `monitor` | 自动 |

#### 图标样式规范

```css
/* 基础图标样式 */
.icon {
  width: 1em;
  height: 1em;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
  fill: none;
  vertical-align: -0.125em;
}

/* 尺寸变体 */
.icon-sm { width: 16px; height: 16px; }
.icon-md { width: 20px; height: 20px; }
.icon-lg { width: 24px; height: 24px; }
.icon-xl { width: 32px; height: 32px; }

/* 旋转动画 (用于 loader) */
.icon-spin {
  animation: spin 1s linear infinite;
}

/* 颜色变体 */
.icon-success { color: var(--accent-success); }
.icon-warning { color: var(--accent-warning); }
.icon-error { color: var(--accent-error); }
.icon-muted { color: var(--text-tertiary); }
```

#### 使用示例

```html
<!-- 导航栏 -->
<button class="nav-btn" aria-label="切换侧边栏">
  <i data-lucide="menu" class="icon-md"></i>
</button>

<!-- 用户消息 -->
<div class="message-header">
  <i data-lucide="user" class="icon-md"></i>
  <span>You</span>
</div>

<!-- AI 消息 -->
<div class="message-header">
  <i data-lucide="bot" class="icon-md"></i>
  <span>SanBot</span>
</div>

<!-- 工具调用 - 成功 -->
<div class="tool-item">
  <i data-lucide="check" class="icon-sm icon-success"></i>
  <i data-lucide="terminal" class="icon-sm"></i>
  <span class="tool-name">exec</span>
  <span class="tool-input">ls -la</span>
  <span class="tool-time">0.12s</span>
</div>

<!-- 工具调用 - 进行中 -->
<div class="tool-item">
  <i data-lucide="loader-2" class="icon-sm icon-warning icon-spin"></i>
  <i data-lucide="file-plus" class="icon-sm"></i>
  <span class="tool-name">write</span>
  <span class="tool-input">src/new.ts</span>
  <span class="tool-status">running</span>
</div>

<!-- 连接状态 -->
<div class="status-indicator">
  <i data-lucide="wifi" class="icon-sm icon-success"></i>
  <span>已连接</span>
</div>

<!-- 主题切换 -->
<button class="theme-toggle" aria-label="切换主题">
  <i data-lucide="moon" class="icon-md"></i>
</button>
```

#### 自定义 Logo

SanBot Logo 使用自定义 SVG，体现道家"三生万物"理念：

```html
<svg viewBox="0 0 32 32" class="logo" aria-label="SanBot Logo">
  <!-- 外圆 - 道 -->
  <circle cx="16" cy="16" r="14" stroke="currentColor" stroke-width="1.5" fill="none" opacity="0.3"/>
  <!-- 中圆 - 阴阳 -->
  <circle cx="16" cy="16" r="9" stroke="currentColor" stroke-width="1.5" fill="none" opacity="0.6"/>
  <!-- 内圆 - 核心 -->
  <circle cx="16" cy="16" r="4" fill="currentColor"/>
  <!-- 三点 - 三生万物 -->
  <circle cx="16" cy="6" r="1.5" fill="currentColor"/>
  <circle cx="8" cy="22" r="1.5" fill="currentColor"/>
  <circle cx="24" cy="22" r="1.5" fill="currentColor"/>
</svg>
```

```css
.logo {
  width: 32px;
  height: 32px;
  color: var(--accent-primary);
}
```

---

## 5. 组件设计

### 5.1 消息气泡

#### 用户消息
```
┌─────────────────────────────────────────────────────────┐
│  [user]  You                                 10:30 AM  │
│  ─────────────────────────────────────────────────────  │
│  重构 sanbot 的 webui，参考 opencode 的设计            │
└─────────────────────────────────────────────────────────┘

图标: <i data-lucide="user">
背景: var(--user-bubble)
边框: 1px solid var(--border-muted)
圆角: var(--radius-lg)
```

#### AI 消息
```
┌─────────────────────────────────────────────────────────┐
│  [bot]  SanBot                               10:30 AM  │
│  ─────────────────────────────────────────────────────  │
│  我来帮你重构 WebUI。首先让我了解现有实现...           │
│                                                         │
│  ┌─ 工具调用 ─────────────────────────────────────────┐ │
│  │ (内嵌工具区块)                                     │ │
│  └────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘

图标: <i data-lucide="bot">
背景: var(--ai-bubble)
```

### 5.2 工具调用区块

#### 折叠状态 (默认，>3个工具时)
```
┌─ 工具调用 ──────────────────────────────────────────────┐
│  [check] 已完成 3  ·  [loader-2] 进行中 1  ·  [circle] 等待 2  │
│                                     [chevron-down 展开] │
└─────────────────────────────────────────────────────────┘
```

#### 展开状态
```
┌─ 工具调用 (3/6) ────────────────────────────────────────┐
│                                       [chevron-up 折叠] │
│  ┌────────────────────────────────────────────────────┐ │
│  │ [check]    [file-text] read   index.html    0.12s │ │
│  │ [check]    [file-text] read   server.ts     0.08s │ │
│  │ [check]    [terminal]  exec   ls -la        0.21s │ │
│  │ [loader-2] [file-plus] write  new-ui.html running │ │
│  │ [circle]   [terminal]  exec   bun test    pending │ │
│  │ [circle]   [terminal]  exec   git add     pending │ │
│  └────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘

图标说明:
- [check]: 成功状态，绿色
- [loader-2]: 进行中，琥珀色 + 旋转动画
- [circle]: 等待中，灰色
- [file-text]: 读取文件
- [file-plus]: 写入文件
- [terminal]: 执行命令
```

#### 工具行状态图标
```
[check]     成功    var(--accent-success)
[loader-2]  进行中  var(--accent-warning) + 旋转动画
[circle]    等待    var(--text-tertiary)
[x]         失败    var(--accent-error)
```

#### 工具行交互
- **悬停**: 背景变亮，显示"点击查看详情"
- **点击**: 展开该工具的输入/输出详情，或打开右侧抽屉

### 5.3 输入区域

```
┌─────────────────────────────────────────────────────────┐
│  ┌───────────────────────────────────────────────────┐  │
│  │ 输入消息，按 ⌘↵ 发送...                          │  │
│  │                                                   │  │
│  │                                                   │  │
│  └───────────────────────────────────────────────────┘  │
│                                                         │
│  [paperclip] 附件   /命令          字数: 0   [send] 发送│
└─────────────────────────────────────────────────────────┘

图标:
- [paperclip]: 附件按钮
- [send]: 发送按钮

特性:
- 自动增高 (最大 200px)
- 支持拖拽文件
- / 触发命令菜单
- ⌘↵ 发送 (可配置为 ↵)
```

### 5.4 会话列表项

```
┌─────────────────────────────────────────────────────────┐
│  [circle]  重构 webui                            10:30 │
│            最后消息预览...                              │
└─────────────────────────────────────────────────────────┘

状态指示 (使用填充圆点，非图标):
- 绿色圆点: 活跃 (有未完成任务)
- 琥珀色圆点 + 脉冲: 思考中
- 灰色圆点: 空闲

悬停显示操作图标:
- [pencil]: 重命名
- [trash-2]: 删除
- [more-horizontal]: 更多

交互:
- 悬停: 显示删除/重命名按钮
- 右键: 上下文菜单
- 长按 (移动端): 上下文菜单
```

### 5.5 右侧抽屉

```
┌─────────────────────────────────────────┐
│  [x]  文件变更详情                      │  Header
├─────────────────────────────────────────┤
│  [file-text] src/web/new-ui.html        │  文件名
│  ─────────────────────────────────────  │
│  + <!DOCTYPE html>                      │  Diff 视图
│  + <html lang="zh-CN">                  │
│  + <head>                               │
│  +   <meta charset="UTF-8">             │
│  ...                                    │
├─────────────────────────────────────────┤
│  [copy] 复制   [external-link] 打开     │  操作栏
└─────────────────────────────────────────┘

图标:
- [x]: 关闭抽屉
- [file-text]: 文件图标
- [copy]: 复制内容
- [external-link]: 在编辑器中打开

宽度: 400px (桌面) / 100% (移动)
动画: 从右侧滑入 (200ms ease-out)
```


---

## 6. 交互设计

### 6.1 键盘快捷键

| 快捷键 | 功能 | 作用域 |
|--------|------|--------|
| `⌘ K` | 打开全局搜索 | 全局 |
| `⌘ N` | 新建会话 | 全局 |
| `⌘ ↵` | 发送消息 | 输入框 |
| `⌘ /` | 显示快捷键帮助 | 全局 |
| `⌘ B` | 切换侧边栏 | 全局 |
| `⌘ .` | 停止当前任务 | 全局 |
| `↑` | 编辑上一条消息 | 输入框为空时 |
| `Esc` | 关闭抽屉/弹窗 | 全局 |
| `⌘ 1-9` | 切换到第 N 个会话 | 全局 |

### 6.2 手势支持 (移动端)

| 手势 | 功能 |
|------|------|
| 左滑消息 | 显示操作菜单 (复制/删除) |
| 右滑边缘 | 打开侧边栏 |
| 左滑边缘 | 关闭侧边栏 |
| 下拉 | 刷新连接状态 |
| 长按消息 | 显示上下文菜单 |

### 6.3 状态反馈

#### 连接状态
```
[wifi]      已连接     绿色
[loader-2]  连接中...  琥珀色 + 旋转
[wifi-off]  已断开     灰色
● 重连中...  琥珀色脉冲
✗ 连接失败   红色 + 重试按钮
```

#### 发送状态
```
发送中 → 按钮显示加载动画，输入框禁用
已发送 → 消息出现在对话流
失败   → 消息显示红色边框 + 重试按钮
```

#### AI 响应状态
```
思考中   → 显示 "SanBot 正在思考..." + 骨架屏
流式输出 → 文字逐字出现 + 光标闪烁
工具调用 → 工具区块出现，状态实时更新
完成     → 光标消失，工具区块可折叠
```

---

## 7. 状态设计

### 7.1 空状态

#### 无会话
```
┌─────────────────────────────────────────────────────────┐
│                                                         │
│                      [Logo SVG]                         │
│                                                         │
│                  欢迎使用 SanBot                        │
│                                                         │
│           你的自主超级助手，随时准备帮助你              │
│                                                         │
│              [plus] 开始新对话                          │
│                                                         │
│         提示: 按 ⌘K 搜索，⌘N 新建会话                  │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

#### 会话无消息
```
┌─────────────────────────────────────────────────────────┐
│                                                         │
│                  有什么我可以帮你的？                   │
│                                                         │
│     [lightbulb] 试试这些:                               │
│     • "帮我分析这个项目的结构"                         │
│     • "写一个 React 组件"                              │
│     • "解释这段代码"                                   │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### 7.2 加载状态

#### 初始加载
```
┌─────────────────────────────────────────────────────────┐
│                                                         │
│                 [loader-2] 连接中...                    │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

#### 消息加载 (骨架屏)
```
┌─────────────────────────────────────────────────────────┐
│  [bot] SanBot                                           │
│  ─────────────────────────────────────────────────────  │
│  ████████████████████████████                           │
│  ██████████████████                                     │
│  ████████████████████████                               │
└─────────────────────────────────────────────────────────┘
骨架条: 灰色渐变动画 (shimmer effect)
```

### 7.3 错误状态

#### 连接错误
```
┌─────────────────────────────────────────────────────────┐
│                                                         │
│                [alert-triangle] 连接已断开              │
│                                                         │
│              无法连接到 SanBot 服务器                   │
│              请检查服务是否正在运行                     │
│                                                         │
│              [refresh-cw] 重新连接                      │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

#### 消息发送失败
```
┌─────────────────────────────────────────────────────────┐
│  [user] You                                  10:30 AM  │
│  ─────────────────────────────────────────────────────  │
│  重构 webui                                             │
│                                                         │
│  [alert-circle] 发送失败     [refresh-cw] 重试  [trash-2] 删除 │
└─────────────────────────────────────────────────────────┘
边框: 2px solid var(--accent-error)
```

#### 工具执行错误
```
┌─ 工具调用 ──────────────────────────────────────────────┐
│  [x]  [terminal] exec   rm -rf /              失败     │
│       └─ 错误: 权限被拒绝              [info] 详情     │
└─────────────────────────────────────────────────────────┘
```


---

## 8. 动效设计

### 8.1 动画原则

- **快速响应**: 用户操作反馈 < 100ms
- **流畅过渡**: 状态变化 150-300ms
- **不打扰**: 动画不阻塞用户操作
- **有意义**: 每个动画都传达信息

### 8.2 动画定义

```css
:root {
  /* 缓动函数 */
  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
  --ease-in-out: cubic-bezier(0.65, 0, 0.35, 1);
  --ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
  
  /* 时长 */
  --duration-fast: 100ms;
  --duration-normal: 200ms;
  --duration-slow: 300ms;
}

/* 消息进入 */
@keyframes message-in {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* 工具状态脉冲 */
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

/* 加载旋转 */
@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* 骨架屏闪烁 */
@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}

/* 光标闪烁 */
@keyframes blink {
  0%, 50% { opacity: 1; }
  51%, 100% { opacity: 0; }
}

/* 抽屉滑入 */
@keyframes slide-in-right {
  from { transform: translateX(100%); }
  to { transform: translateX(0); }
}
```

### 8.3 动画应用

| 元素 | 动画 | 时长 | 缓动 |
|------|------|------|------|
| 消息出现 | message-in | 200ms | ease-out |
| 工具进行中 | pulse | 2s | linear (循环) |
| 连接中图标 | spin | 1s | linear (循环) |
| 骨架屏 | shimmer | 1.5s | linear (循环) |
| 流式光标 | blink | 1s | step-end (循环) |
| 侧边栏展开 | slide | 200ms | ease-out |
| 抽屉打开 | slide-in-right | 200ms | ease-out |
| 按钮悬停 | scale(1.02) | 100ms | ease-out |
| 按钮点击 | scale(0.98) | 50ms | ease-in |

---

## 9. 技术实现

### 9.1 技术选型

| 层面 | 选择 | 理由 |
|------|------|------|
| 框架 | 纯 HTML/CSS/JS | 保持简单，无构建步骤 |
| 样式 | CSS Variables + BEM | 主题切换 + 可维护性 |
| 通信 | WebSocket | 实时双向通信 |
| 图标 | Emoji + SVG | 无依赖，体积小 |
| 字体 | Google Fonts CDN | 可选加载，有降级 |

### 9.2 文件结构

```
src/web/
├── static/
│   ├── index.html        # 主 HTML (包含内联 CSS/JS)
│   ├── styles/           # 可选：拆分样式
│   │   ├── variables.css
│   │   ├── components.css
│   │   └── animations.css
│   └── scripts/          # 可选：拆分脚本
│       ├── websocket.js
│       ├── ui.js
│       └── utils.js
├── server.ts             # WebSocket 服务器
└── adapters.ts           # Agent 适配器
```

### 9.3 性能考量

1. **首屏加载**
   - 内联关键 CSS
   - 延迟加载非关键字体
   - 压缩 HTML/CSS/JS

2. **运行时性能**
   - 虚拟滚动 (消息 > 100 条时)
   - 防抖输入处理
   - 节流滚动事件

3. **内存管理**
   - 限制消息历史 (最近 500 条)
   - 清理已完成的工具调用
   - 断开时释放 WebSocket

---

## 10. 可访问性

### 10.1 ARIA 标签

```html
<main role="main" aria-label="对话区域">
<nav role="navigation" aria-label="会话列表">
<button aria-label="发送消息" aria-disabled="false">
<div role="status" aria-live="polite">SanBot 正在思考...</div>
<div role="log" aria-label="消息历史">
```

### 10.2 键盘导航

- 所有交互元素可 Tab 聚焦
- 焦点可见样式 (outline)
- 逻辑的 Tab 顺序
- 快捷键不与系统冲突

### 10.3 颜色对比

- 文字对比度 ≥ 4.5:1 (WCAG AA)
- 大文字对比度 ≥ 3:1
- 不仅依赖颜色传达信息 (配合图标/文字)

---

## 11. 与 OpenCode 对比

| 方面 | OpenCode | SanBot v2 |
|------|----------|-----------|
| 布局 | 三栏固定 | 双栏 + 按需抽屉 |
| 主题 | 仅浅色 | 深/浅双主题 |
| 工具展示 | 独立步骤列表 | 内嵌 + 智能折叠 |
| 文件变更 | 始终显示 | 按需查看 |
| 信息密度 | 高 (全部展示) | 渐进式 (按需展开) |
| 移动端 | 未优化 | 响应式设计 |
| 快捷键 | 有限 | 完整系统 |
| 空状态 | 无 | 精心设计 |

---

## 12. 实现优先级

### Phase 1: 核心功能
- [ ] 基础布局 (双栏)
- [ ] 消息收发
- [ ] 工具调用显示
- [ ] 深色主题

### Phase 2: 增强体验
- [ ] 浅色主题
- [ ] 会话管理
- [ ] 键盘快捷键
- [ ] 右侧抽屉

### Phase 3: 完善细节
- [ ] 响应式适配
- [ ] 动画效果
- [ ] 空/错误状态
- [ ] 可访问性

---

*文档版本: v2.0*
*最后更新: 2026-02-05*
