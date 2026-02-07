#!/usr/bin/env python3
import sys
import requests
from bs4 import BeautifulSoup
import json

# 通过代理抓取 Claude 文档
def scrape_claude_docs():
    proxy_url = "http://127.0.0.1:7897"
    proxies = {'http': proxy_url, 'https': proxy_url}
    
    headers = {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
    }
    
    # Claude Agent SDK 文档页面
    urls = [
        'https://platform.claude.com/docs/en/agent-sdk/sessions',
        'https://platform.claude.com/docs/en/agent-sdk/getting-started',
        'https://platform.claude.com/docs/en/agent-sdk/overview',
    ]
    
    results = []
    
    for url in urls:
        try:
            print(f"📥 Fetching: {url}")
            resp = requests.get(url, proxies=proxies, headers=headers, timeout=30)
            print(f"✅ Status: {resp.status_code}")
            
            soup = BeautifulSoup(resp.text, 'html.parser')
            
            # 移除不需要的元素
            for elem in soup(['script', 'style', 'nav', 'footer', 'header']):
                elem.decompose()
            
            # 获取标题
            title = soup.title.string if soup.title else "No title"
            
            # 获取主要内容
            main = soup.find('main') or soup.find('article') or soup.find(['div'], class_=lambda x: x and ('content' in x.lower() or 'doc' in x.lower()))
            
            if not main:
                main = soup.find('body')
            
            if main:
                text = main.get_text(separator='\n', strip=True)
            else:
                text = soup.get_text(separator='\n', strip=True)
            
            results.append({
                'url': url,
                'title': title.strip(),
                'content': text[:20000]
            })
            
        except Exception as e:
            print(f"❌ Error fetching {url}: {e}")
    
    # 保存结果
    output_file = '/Users/slicenfer/Development/projects/self/SanBot/claude_docs.json'
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
    
    print(f"\n✅ Saved to: {output_file}")
    print(f"📊 Total pages: {len(results)}")
    
    return results

if __name__ == '__main__':
    scrape_claude_docs()
