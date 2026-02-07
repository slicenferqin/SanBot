#!/usr/bin/env python3
"""
抖音搜索工具 - 使用 so.douyin.com 搜索页面
反爬虫较弱，适合获取用户信息
"""

import asyncio
import json
import time
import re
from playwright.async_api import async_playwright
from datetime import datetime

class DouyinSearcher:
    def __init__(self, headless=False):
        self.headless = headless
        self.user_data_dir = "./douyin_session"
        
    async def search_user(self, keyword):
        """搜索用户"""
        print(f"\n{'='*60}")
        print(f"🔍 搜索抖音用户: {keyword}")
        print(f"{'='*60}\n")
        
        async with async_playwright() as p:
            # 启动浏览器 - 持久化上下文
            browser = await p.chromium.launch_persistent_context(
                user_data_dir=self.user_data_dir,
                headless=self.headless,
                args=[
                    '--disable-blink-features=AutomationControlled',
                    '--no-first-run',
                    '--disable-infobars'
                ]
            )
            
            page = browser.pages[0] if browser.pages else await browser.new_page()
            
            # 设置真实 User-Agent
            await page.set_extra_http_headers({
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
            })
            
            try:
                # 访问抖音搜索页面
                search_url = f"https://so.douyin.com/search?keyword={keyword}&source=normal_search&type=user"
                print(f"📍 访问搜索页面: {search_url}")
                
                await page.goto(search_url, wait_until='networkidle', timeout=30000)
                print("✅ 页面加载成功")
                
                # 等待内容加载
                await asyncio.sleep(3)
                
                # 获取页面内容
                content = await page.content()
                
                # 尝试多种方式获取数据
                print("\n🔍 尝试提取数据...")
                
                # 方法1: 查找 script 标签中的数据
                script_pattern = r'<script[^>]*id="RENDER_DATA"[^>]*>(.*?)</script>'
                matches = re.findall(script_pattern, content)
                
                if matches:
                    print("✅ 找到 RENDER_DATA!")
                    for idx, match in enumerate(matches[:3]):  # 只取前3个
                        try:
                            # 解码数据
                            decoded_data = bytes(match, 'utf-8').decode('unicode_escape')
                            # 提取 JSON 部分
                            json_match = re.search(r'\{.*\}', decoded_data)
                            if json_match:
                                data = json.loads(json_match.group())
                                print(f"\n📊 数据块 #{idx+1}:")
                                print(json.dumps(data, ensure_ascii=False, indent=2)[:1000])
                                
                                # 尝试提取用户信息
                                self._extract_user_info(data)
                        except Exception as e:
                            print(f"❌ 解析数据块 #{idx+1} 失败: {e}")
                
                # 方法2: 截图看看页面内容
                screenshot_path = f"douyin_search_{keyword}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.png"
                await page.screenshot(path=screenshot_path, full_page=True)
                print(f"\n📸 页面截图已保存: {screenshot_path}")
                
                # 方法3: 保存完整 HTML 供分析
                html_path = f"douyin_search_{keyword}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.html"
                with open(html_path, 'w', encoding='utf-8') as f:
                    f.write(content)
                print(f"📄 页面 HTML 已保存: {html_path}")
                
                # 方法4: 检查是否需要登录
                if "验证" in content or "安全验证" in content:
                    print("\n⚠️ 触发了验证页面")
                    print("💡 请在浏览器中手动完成验证，然后按回车继续...")
                    input()
                    
                    # 重新获取内容
                    await asyncio.sleep(2)
                    content = await page.content()
                
                # 等待用户查看
                print(f"\n⏳ 浏览器将保持打开 30 秒，请检查页面内容...")
                await asyncio.sleep(30)
                
            except Exception as e:
                print(f"❌ 搜索失败: {e}")
                import traceback
                traceback.print_exc()
            
            finally:
                await browser.close()
    
    def _extract_user_info(self, data):
        """从数据中提取用户信息"""
        try:
            # 尝试不同的数据路径
            paths = [
                'data.data',
                'app.videoData', 
                'data',
                'result.data'
            ]
            
            user_info = None
            for path in paths:
                parts = path.split('.')
                current = data
                for part in parts:
                    if isinstance(current, dict) and part in current:
                        current = current[part]
                    else:
                        break
                else:
                    user_info = current
                    break
            
            if user_info:
                print(f"\n✅ 找到用户信息:")
                print(json.dumps(user_info, ensure_ascii=False, indent=2)[:500])
                
        except Exception as e:
            print(f"❌ 提取用户信息失败: {e}")

async def main():
    searcher = DouyinSearcher(headless=False)
    await searcher.search_user("贾乃亮")

if __name__ == "__main__":
    asyncio.run(main())
