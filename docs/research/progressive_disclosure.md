# 渐进式披露（Progressive Disclosure）在 Agent Skills 中的应用

## 问题分析

### 当前系统的痛点
1. **上下文膨胀**：所有 skills 的定义、参数、示例都在系统提示词中
2. **浪费 token**：大量未使用的 skills 描述占据 context
3. **扩展性差**：skills 越多，系统提示词越长

## 渐进式披露策略

### 策略 1：层级索引系统
```
System Prompt:
├── Skill Categories (轻量级)
│   ├── 文件操作: file_read, file_write, file_edit
│   ├── 数据分析: json_parse, csv_export
│   └── 网络工具: search, scrape
└── Dynamic Loading: 按需加载详细定义

Memory (L1):
├── Recent Skills: 最近使用的 skill 详细定义
└── Cached Results: skill 执行结果缓存
```

### 策略 2：Just-in-Time 定义
```
Step 1: 用户提问
Step 2: 检测需要的 skill
Step 3: 动态注入该 skill 的完整定义到 context
Step 4: 执行 skill
Step 5: 清理 context（保留必要摘要）
```

### 策略 3：紧凑表示 + 完整文档分离
```yaml
# 系统提示词中只保留
tools:
  - name: file_search
    one_liner: "搜索文件内容，支持正则表达式"
    trigger: ["搜索", "查找文件", "grep"]
  
  - name: data_analyze
    one_liner: "分析 CSV/JSON 数据"
    trigger: ["分析", "统计", "聚合"]

# 完整文档在外部存储，按需加载
```

## OpenClaw 可能的做法（推测）

基于常见 Agent 框架的设计模式：

### 1. Tool Registry + Lazy Loading
```python
class ToolRegistry:
    def __init__(self):
        self.tools = {}  # 轻量级索引
    
    def get_tool(self, name):
        if name not in self.loaded:
            definition = self.load_definition(name)
            self.loaded[name] = definition
        return self.loaded[name]
```

### 2. Skill Embedding 检索
```
Query Embedding → Skill Description Embedding → Top-K 匹配 → 动态加载

优势：
- 语义匹配比关键词更准确
- 可以处理模糊需求
- 自动选择最相关的 skills
```

### 3. 多级缓存
```
L1: 热门 skills (常驻内存)
L2: 最近使用的 skills (session 缓存)
L3: 冷门 skills (磁盘加载)
```

## SanBot 改进方案

### Phase 1: 紧凑索引（立即实施）
```yaml
# System Prompt 中只保留
available_skills:
  category_files: "文件：read_file, write_file, edit_file"
  category_exec: "执行：exec (系统命令)"
  category_tools: "工具：create_tool, list_tools, run_tool"
  
# 动态注入机制
when_skill_needed: "调用 get_skill_definition(name)"
```

### Phase 2: 智能检索（中期）
```
1. 用户意图识别
2. Embedding 相似度匹配
3. 动态加载 Top-3 skills
4. 执行后清理，只保留结果摘要
```

### Phase 3: 自适应优化（长期）
```
- 统计每个 skill 的使用频率
- 自动调整常驻 skills 列表
- 学习 skill 调用模式
- 预加载可能需要的 skills
```

## 技术实现

### 数据结构
```json
{
  "skill_index": {
    "file_read": {
      "name": "file_read",
      "category": "文件操作",
      "one_liner": "读取文件内容，支持分页",
      "triggers": ["读取", "打开文件", "cat", "view"],
      "cost_estimate": 100  // 预估 token 消耗
    }
  },
  "skill_definitions": {
    "file_read": "完整定义（存在外部）"
  }
}
```

### Context 管理策略
```python
def manage_context(message, skills_used):
    # 1. 分析当前消息需要的 skills
    needed_skills = detect_needed_skills(message)
    
    # 2. 检查是否已在 context 中
    for skill in needed_skills:
        if skill not in current_context_skills:
            # 动态注入
            inject_skill_definition(skill)
    
    # 3. 执行完成后，清理不必要的 skill 定义
    cleanup_old_skills()
    
    # 4. 压缩历史对话
    compress_conversation_history()
```

## 预期效果

### Token 节省
- 常驻 skills: ~500 tokens (只有索引)
- 按需加载: ~200 tokens/skill
- 对比原方案: 节省 60-80% tokens

### 性能提升
- 系统提示词更短 → 响应更快
- context window 利用更高效
- 支持更多 skills 而不膨胀
