#!/usr/bin/env python3
"""
SanBot Skills Manager - 渐进式披露演示

展示如何通过紧凑索引 + 按需加载来优化上下文使用
"""

import json
import sys
from pathlib import Path

# Skills 索引（轻量级，常驻系统提示词）
SKILLS_INDEX = {
    "file_read": {
        "category": "文件操作",
        "one_liner": "读取文件内容，支持分页避免 context 爆炸",
        "triggers": ["读取", "打开文件", "查看", "cat", "view file"],
        "cost_tokens": 150  # 预估完整定义的 token 数
    },
    "file_write": {
        "category": "文件操作", 
        "one_liner": "写入文件，自动创建目录，支持覆盖或追加模式",
        "triggers": ["写入", "保存", "创建文件", "write", "save"],
        "cost_tokens": 120
    },
    "file_edit": {
        "category": "文件操作",
        "one_liner": "精确编辑文件内容，支持搜索替换",
        "triggers": ["编辑", "修改", "替换", "edit", "modify"],
        "cost_tokens": 100
    },
    "exec_cmd": {
        "category": "系统操作",
        "one_liner": "执行 shell 命令，获取 stdout/stderr",
        "triggers": ["执行", "运行", "命令", "exec", "run", "bash"],
        "cost_tokens": 80
    },
    "create_tool": {
        "category": "工具管理",
        "one_liner": "创建新的 CLI 工具并注册到工具中心",
        "triggers": ["创建工具", "新工具", "create tool", "make tool"],
        "cost_tokens": 200
    }
}

# 完整定义（按需加载，不常驻系统提示词）
SKILLS_FULL_DEFINITIONS = {
    "file_read": {
        "name": "read_file",
        "description": "读取文件内容，支持分页避免 context 爆炸。返回文件内容、总行数、是否被截断。",
        "parameters": {
            "path": {"type": "string", "description": "文件路径"},
            "page_size": {"type": "integer", "description": "每页行数，默认 100"},
            "page": {"type": "integer", "description": "页码，从 1 开始"}
        },
        "examples": [
            {"query": "读取 config.json", "call": "read_file(path='config.json')"},
            {"query": "查看 main.py 前 50 行", "call": "read_file(path='main.py', page_size=50)"}
        ]
    },
    "file_write": {
        "name": "write_file",
        "description": "写入文件，自动创建目录。支持覆盖或追加模式。",
        "parameters": {
            "path": {"type": "string", "description": "文件路径"},
            "content": {"type": "string", "description": "文件内容"},
            "mode": {"type": "string", "description": "写入模式：overwrite(默认) 或 append"}
        },
        "examples": [
            {"query": "创建 hello.txt", "call": "write_file(path='hello.txt', content='Hello World')"},
            {"query": "追加日志", "call": "write_file(path='log.txt', content='error', mode='append')"}
        ]
    }
}

def print_compact_index():
    """打印紧凑的 skills 索引（适合放在系统提示词中）"""
    print("📋 SanBot Skills 索引（紧凑版）")
    print("=" * 60)
    
    # 按分类组织
    categories = {}
    for skill_id, info in SKILLS_INDEX.items():
        cat = info["category"]
        if cat not in categories:
            categories[cat] = []
        categories[cat].append((skill_id, info))
    
    total_tokens = 0
    for category, skills in categories.items():
        print(f"\n【{category}】")
        for skill_id, info in skills:
            print(f"  • {skill_id}: {info['one_liner']}")
            print(f"    触发词: {', '.join(info['triggers'][:3])}")
            total_tokens += info['cost_tokens']
    
    print(f"\n📊 统计:")
    print(f"  • Skills 数量: {len(SKILLS_INDEX)}")
    print(f"  • 索引大小: ~300 tokens")
    print(f"  • 完整定义: {total_tokens} tokens (按需加载)")
    print(f"  • 节省比例: ~{100 - (300/total_tokens*100):.0f}%")

def demonstrate_progressive_disclosure():
    """演示渐进式披露过程"""
    print("\n\n🎬 渐进式披露演示")
    print("=" * 60)
    
    # 场景 1: 用户询问
    user_query = "帮我读取 config.json 文件"
    print(f"\n👤 用户: {user_query}")
    
    # 场景 2: 检测需要的 skill
    print("\n🔍 步骤 1: 检测需要的 skill")
    detected_skills = []
    for skill_id, info in SKILLS_INDEX.items():
        if any(trigger in user_query.lower() for trigger in info['triggers']):
            detected_skills.append(skill_id)
    
    print(f"  检测到: {detected_skills}")
    
    # 场景 3: 动态加载完整定义
    print("\n📥 步骤 2: 动态加载完整定义")
    for skill_id in detected_skills:
        if skill_id in SKILLS_FULL_DEFINITIONS:
            print(f"\n  加载 {skill_id}:")
            print(f"    {json.dumps(SKILLS_FULL_DEFINITIONS[skill_id], indent=4, ensure_ascii=False)}")
    
    # 场景 4: 执行
    print("\n⚙️ 步骤 3: 执行 skill")
    print("  read_file(path='config.json')")
    
    # 场景 5: 清理
    print("\n🧹 步骤 4: 清理 context")
    print("  ✓ 移除 skill 完整定义")
    print("  ✓ 保留执行结果摘要")
    print("  ✓ 索引保持不变")

def calculate_savings():
    """计算 token 节省"""
    print("\n\n💰 Token 节省计算")
    print("=" * 60)
    
    # 传统方案
    traditional_total = sum(info['cost_tokens'] for info in SKILLS_INDEX.values())
    print(f"\n❌ 传统方案（所有定义常驻）:")
    print(f"  系统提示词大小: {traditional_total} tokens")
    print(f"  每次对话都占用: {traditional_total} tokens")
    
    # 渐进式披露方案
    index_only = 300  # 索引大小
    avg_skills_per_query = 2  # 平均每次查询使用的 skill 数
    avg_load_cost = 150  # 平均每个 skill 的定义大小
    progressive_avg = index_only + (avg_skills_per_query * avg_load_cost)
    
    print(f"\n✅ 渐进式披露方案:")
    print(f"  索引常驻: {index_only} tokens")
    print(f"  平均加载 {avg_skills_per_query} 个 skills: {avg_skills_per_query * avg_load_cost} tokens")
    print(f"  平均每次对话: {progressive_avg} tokens")
    
    savings = traditional_total - progressive_avg
    savings_percent = (savings / traditional_total) * 100
    
    print(f"\n🎯 节省效果:")
    print(f"  • 每次对话节省: {savings} tokens")
    print(f"  • 节省比例: {savings_percent:.1f}%")
    print(f"  • 100 次对话节省: {savings * 100} tokens ≈ ¥{savings * 100 / 1000000 * 0.02:.2f}")

def main():
    if len(sys.argv) > 1:
        command = sys.argv[1]
        
        if command == "index":
            print_compact_index()
        elif command == "demo":
            demonstrate_progressive_disclosure()
        elif command == "savings":
            calculate_savings()
        elif command == "all":
            print_compact_index()
            demonstrate_progressive_disclosure()
            calculate_savings()
        else:
            print(f"Unknown command: {command}")
            print("Available: index, demo, savings, all")
    else:
        # 默认显示所有
        print_compact_index()
        demonstrate_progressive_disclosure()
        calculate_savings()

if __name__ == "__main__":
    main()
