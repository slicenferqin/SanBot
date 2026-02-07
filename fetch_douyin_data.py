#!/usr/bin/env python3
"""
直接获取抖音搜索页面数据
使用 requests 库，避免浏览器自动化
"""

import requests
import json
import re
from datetime import datetime

def fetch_douyin_user(keyword):
    """获取抖音用户搜索数据"""
    print(f"\n{'='*60}")
    print(f"🔍 搜索抖音用户: {keyword}")
    print(f"{'='*60}\n")
    
    # 搜索页面 URL
    url = "https://so.douyin.com/search/"
    params = {
        'keyword': keyword,
        'source': 'normal_search',
        'type': 'user'
    }
    
    # 真实浏览器 headers
    headers = {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Referer': 'https://www.douyin.com/',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
    }
    
    try:
        print(f"📍 请求 URL: {url}")
        print(f"📋 参数: {params}")
        
        # 发送请求
        response = requests.get(url, params=params, headers=headers, timeout=15)
        
        print(f"\n✅ 响应状态码: {response.status_code}")
        print(f"📄 响应长度: {len(response.text)} 字符")
        print(f"🔗 实际 URL: {response.url}")
        
        # 保存完整 HTML
        html_path = f"douyin_search_{keyword}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.html"
        with open(html_path, 'w', encoding='utf-8') as f:
            f.write(response.text)
        print(f"💾 HTML 已保存: {html_path}")
        
        # 检查是否被重定向到验证页面
        if '验证' in response.text or 'security' in response.url.lower():
            print("\n⚠️ 被重定向到安全验证页面")
            return None
        
        # 提取 RENDER_DATA
        print("\n🔍 提取数据...")
        script_pattern = r'<script[^>]*id="RENDER_DATA"[^>]*>(.*?)</script>'
        matches = re.findall(script_pattern, response.text)
        
        if matches:
            print(f"✅ 找到 {len(matches)} 个数据块!")
            
            for idx, match in enumerate(matches):
                try:
                    # 解码
                    decoded = bytes(match, 'utf-8').decode('unicode_escape')
                    # 提取 JSON
                    json_match = re.search(r'\{.*\}', decoded)
                    
                    if json_match:
                        data = json.loads(json_match.group())
                        
                        # 保存数据
                        json_path = f"douyin_data_{keyword}_{idx+1}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
                        with open(json_path, 'w', encoding='utf-8') as f:
                            json.dump(data, f, ensure_ascii=False, indent=2)
                        print(f"💾 数据块 #{idx+1} 已保存: {json_path}")
                        
                        # 尝试提取用户信息
                        extract_user_stats(data)
                        
                except Exception as e:
                    print(f"❌ 解析数据块 #{idx+1} 失败: {e}")
        else:
            print("❌ 未找到 RENDER_DATA")
            # 查找其他可能的数据
            print("\n🔍 查找其他脚本标签...")
            all_scripts = re.findall(r'<script[^>]*>(.*?)</script>', response.text, re.DOTALL)
            print(f"找到 {len(all_scripts)} 个 script 标签")
            
            # 显示前几个非空的脚本
            for i, script in enumerate(all_scripts[:5]):
                if len(script) > 100 and 'window' not in script:
                    print(f"\nScript #{i+1} ({len(script)} 字符):")
                    print(script[:500])
        
        return response.text
        
    except Exception as e:
        print(f"❌ 请求失败: {e}")
        import traceback
        traceback.print_exc()
        return None

def extract_user_stats(data):
    """提取用户统计信息"""
    print("\n" + "="*60)
    print("📊 提取用户统计信息")
    print("="*60)
    
    # 常见的用户信息路径
    user_paths = [
        ['data', 'data'],
        ['app', 'videoData'],
        ['result', 'data'],
        ['data']
    ]
    
    found = False
    
    for path in user_paths:
        current = data
        for key in path:
            if isinstance(current, dict) and key in current:
                current = current[key]
            else:
                break
        else:
            # 找到了，尝试提取用户信息
            if isinstance(current, dict):
                # 尝试提取用户列表
                if 'user_list' in current:
                    users = current['user_list']
                    for user in users[:3]:  # 只显示前3个
                        print_user_info(user)
                        found = True
                
                # 或者直接是用户数据
                elif any(k in current for k in ['nickname', 'uid', 'sec_uid', 'unique_id']):
                    print_user_info(current)
                    found = True
                
                # 或者包含 user 字段
                elif 'user' in current:
                    print_user_info(current['user'])
                    found = True
    
    if not found:
        print("❌ 未找到用户信息，保存完整 JSON 供分析")
        # 保存完整数据
        with open('full_data.json', 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        print("💾 完整数据已保存: full_data.json")

def print_user_info(user):
    """打印用户信息"""
    print("\n" + "─"*60)
    print("👤 用户信息:")
    print("─"*60)
    
    fields = {
        'nickname': '昵称',
        'unique_id': '抖音号',
        'uid': 'UID',
        'sec_uid': 'SEC_UID',
        'signature': '简介',
        'follower_count': '粉丝数',
        'following_count': '关注数',
        'aweme_count': '作品数',
        'favoriting_count': '获赞数',
        'total_favorited': '总获赞'
    }
    
    for key, label in fields.items():
        if key in user and user[key] is not None:
            value = user[key]
            if isinstance(value, int) and 'count' in key:
                value = f"{value:,}"
            print(f"  {label}: {value}")
    
    # 提取头像
    if 'avatar_thumb' in user or 'avatar_url' in user:
        avatar = user.get('avatar_thumb', {}).get('url_list', [''])[0] or user.get('avatar_url', '')
        if avatar:
            print(f"  头像: {avatar}")
    
    print("─"*60)

if __name__ == "__main__":
    fetch_douyin_user("贾乃亮")
