#!/usr/bin/env python3
"""
SanBot Skills Matcher - 基于 Embedding 的智能技能匹配

使用语义相似度来匹配用户查询和技能，而不是简单的关键词匹配
"""

import json
import sys
from pathlib import Path
from typing import List, Tuple

# 模拟的 embedding（实际应该使用真实的 embedding 模型）
def mock_embedding(text: str) -> List[float]:
    """
    生成简单的 hash-based embedding 用于演示
    实际应该使用: OpenAI embeddings, sentence-transformers 等
    """
    # 简单的字符级 hash（仅用于演示）
    import hashlib
    hash_obj = hashlib.md5(text.encode())
    hash_hex = hash_obj.hexdigest()
    
    # 转换为 8 维向量（简化版）
    vector = []
    for i in range(8):
        val = int(hash_hex[i*2:i*2+2], 16) / 255.0
        vector.append(val)
    
    return vector

def cosine_similarity(a: List[float], b: List[float]) -> float:
    """计算余弦相似度"""
    dot_product = sum(x * y for x, y in zip(a, b))
    magnitude_a = sum(x ** 2 for x in a) ** 0.5
    magnitude_b = sum(y ** 2 for y in b) ** 0.5
    return dot_product / (magnitude_a * magnitude_b) if magnitude_a and magnitude_b else 0

# Skills 数据库（包含用于检索的描述）
SKILLS_DATABASE = [
    {
        "id": "file_read",
        "name": "read_file",
        "category": "文件操作",
        "one_liner": "读取文件内容，支持分页避免 context 爆炸",
        "search_queries": [
            "读取文件内容",
            "查看文件",
            "打开文件并显示",
            "cat file content",
            "view source code"
        ],
        "cost_tokens": 150
    },
    {
        "id": "file_write",
        "name": "write_file",
        "category": "文件操作",
        "one_liner": "写入文件，自动创建目录，支持覆盖或追加",
        "search_queries": [
            "写入文件",
            "保存内容到文件",
            "创建新文件",
            "write to file",
            "save output"
        ],
        "cost_tokens": 120
    },
    {
        "id": "file_edit",
        "name": "edit_file",
        "category": "文件操作",
        "one_liner": "精确编辑文件，支持搜索替换",
        "search_queries": [
            "编辑文件",
            "修改文件内容",
            "替换文本",
            "edit file",
            "modify configuration"
        ],
        "cost_tokens": 100
    },
    {
        "id": "exec_cmd",
        "name": "exec",
        "category": "系统操作",
        "one_liner": "执行 shell 命令",
        "search_queries": [
            "执行命令",
            "运行脚本",
            "bash 命令",
            "terminal command",
            "system operation"
        ],
        "cost_tokens": 80
    },
    {
        "id": "create_tool",
        "name": "create_tool",
        "category": "工具管理",
        "one_liner": "创建新的 CLI 工具",
        "search_queries": [
            "创建工具",
            "开发新功能",
            "扩展能力",
            "create utility",
            "add new skill"
        ],
        "cost_tokens": 200
    }
]

class SkillsMatcher:
    """智能技能匹配器"""
    
    def __init__(self):
        # 预计算所有技能的 embedding
        self.skill_embeddings = []
        for skill in SKILLS_DATABASE:
            # 为每个搜索查询生成 embedding
            embeddings = [mock_embedding(q) for q in skill['search_queries']]
            self.skill_embeddings.append({
                'skill': skill,
                'embeddings': embeddings
            })
    
    def match(self, query: str, top_k: int = 3, threshold: float = 0.3) -> List[Tuple[dict, float]]:
        """
        匹配查询到最相关的 skills
        
        Args:
            query: 用户查询
            top_k: 返回前 K 个结果
            threshold: 相似度阈值（0-1）
        
        Returns:
            [(skill, similarity_score), ...]
        """
        query_emb = mock_embedding(query)
        
        # 计算每个 skill 的最高相似度
        scores = []
        for item in self.skill_embeddings:
            skill = item['skill']
            max_sim = 0
            
            for emb in item['embeddings']:
                sim = cosine_similarity(query_emb, emb)
                max_sim = max(max_sim, sim)
            
            if max_sim >= threshold:
                scores.append((skill, max_sim))
        
        # 按相似度排序
        scores.sort(key=lambda x: x[1], reverse=True)
        return scores[:top_k]
    
    def get_full_definition(self, skill_id: str) -> dict:
        """获取 skill 的完整定义（模拟从外部加载）"""
        for skill in SKILLS_DATABASE:
            if skill['id'] == skill_id:
                return {
                    "name": skill['name'],
                    "description": skill['one_liner'],
                    "category": skill['category'],
                    "parameters": {"_": "完整参数定义..."},
                    "examples": ["_示例 1", "_示例 2"]
                }
        return None

def demonstrate_matching():
    """演示智能匹配"""
    print("🧠 SanBot Skills 智能匹配演示")
    print("=" * 60)
    
    matcher = SkillsMatcher()
    
    # 测试查询
    test_queries = [
        "帮我看一下 main.py 的内容",
        "把结果保存到 output.json",
        "修改配置文件中的端口",
        "运行 npm install",
        "创建一个新工具来处理 CSV",
        "今天天气怎么样"  # 无关查询
    ]
    
    for query in test_queries:
        print(f"\n👤 用户: {query}")
        
        # 匹配
        matches = matcher.match(query, top_k=2)
        
        if matches:
            print("🎯 匹配到的 Skills:")
            for skill, score in matches:
                print(f"  • {skill['name']} (相似度: {score:.2f})")
                print(f"    {skill['one_liner']}")
        else:
            print("❌ 未找到匹配的 skills")
    
    # 显示加载效果
    print("\n" + "=" * 60)
    print("📥 动态加载效果:")
    
    # 只加载匹配到的 skills
    query = "读取 config.json 并修改端口"
    matches = matcher.match(query, top_k=2)
    
    total_tokens = 300  # 索引大小
    print(f"\n查询: {query}")
    print(f"匹配到: {[m[0]['id'] for m in matches]}")
    print(f"\nToken 消耗:")
    print(f"  • 索引 (常驻): 300 tokens")
    
    for skill, score in matches:
        cost = skill['cost_tokens']
        total_tokens += cost
        print(f"  • {skill['id']} (按需): {cost} tokens")
    
    print(f"  • 总计: {total_tokens} tokens")
    print(f"\n对比传统方案 (全部加载): {sum(s['cost_tokens'] for s in SKILLS_DATABASE)} tokens")

def show_architecture():
    """展示架构"""
    print("\n\n🏗️ 渐进式披露架构")
    print("=" * 60)
    
    architecture = """
┌─────────────────────────────────────────────────┐
│              System Prompt (常驻)                │
├─────────────────────────────────────────────────┤
│  📋 Skills 索引 (~300 tokens)                    │
│    - file_read: 读取文件...                       │
│    - file_write: 写入文件...                      │
│    - exec_cmd: 执行命令...                        │
│                                                 │
│  🧠 匹配器规则 (轻量级)                           │
│    - 用户查询 → Embedding                        │
│    - 相似度计算                                  │
│    - Top-K 选择                                  │
└─────────────────────────────────────────────────┘
                    ↓ 检测需求
┌─────────────────────────────────────────────────┐
│          Dynamic Injection (按需)                 │
├─────────────────────────────────────────────────┤
│  📥 加载 file_read 完整定义 (~150 tokens)         │
│    - 详细参数说明                                 │
│    - 使用示例                                    │
│    - 错误处理                                    │
└─────────────────────────────────────────────────┘
                    ↓ 执行完成
┌─────────────────────────────────────────────────┐
│              Context Cleanup                      │
├─────────────────────────────────────────────────┤
│  ✓ 移除完整定义                                  │
│  ✓ 保留执行结果摘要                              │
│  ✓ 更新使用统计                                  │
└─────────────────────────────────────────────────┘
"""
    print(architecture)

def main():
    if len(sys.argv) > 1:
        command = sys.argv[1]
        
        if command == "match":
            demonstrate_matching()
        elif command == "arch":
            show_architecture()
        elif command == "all":
            demonstrate_matching()
            show_architecture()
        else:
            print(f"Unknown command: {command}")
            print("Available: match, arch, all")
    else:
        demonstrate_matching()
        show_architecture()

if __name__ == "__main__":
    main()
