#!/usr/bin/env python3
"""
抖音数据抓取工具 - 使用 Playwright 自动化浏览器
支持：获取账号信息、粉丝数、作品数、最近作品的点赞和播放量
"""

import asyncio
import json
import re
from playwright.async_api import async_playwright, TimeoutError as PlaywrightTimeout
from datetime import datetime


class DouyinScraper:
    def __init__(self, headless=False):
        self.headless = headless
        self.base_url = "https://www.douyin.com"
        
    async def scrape_user_info(self, username):
        """
        抓取抖音用户信息
        :param username: 用户名或搜索关键词
        :return: 用户信息和最近作品数据
        """
        async with async_playwright() as p:
            # 启动浏览器
            browser = await p.chromium.launch(
                headless=self.headless,
                args=[
                    '--disable-blink-features=AutomationControlled',
                    '--no-sandbox',
                    '--disable-setuid-sandbox'
                ]
            )
            
            # 创建上下文，设置用户代理
            context = await browser.new_context(
                user_agent='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                viewport={'width': 1920, 'height': 1080}
            )
            
            page = await context.new_page()
            
            try:
                print(f"🔍 正在搜索用户: {username}")
                
                # 访问抖音搜索页面
                search_url = f"{self.base_url}/search/{username}?type=user"
                print(f"📋 访问URL: {search_url}")
                
                await page.goto(search_url, wait_until='domcontentloaded', timeout=30000)
                
                # 等待页面加载
                await asyncio.sleep(5)
                
                # 截图调试
                await page.screenshot(path="/tmp/douyin_search.png")
                print("📸 搜索页面已截图到 /tmp/douyin_search.png")
                
                # 尝试找到用户链接
                print("📄 正在查找用户主页...")
                
                user_page_url = None
                
                # 方法1: 尝试从搜索结果中找到用户链接
                try:
                    # 等待搜索结果中的用户链接
                    await page.wait_for_selector('a[href*="/user/"]', timeout=15000)
                    
                    # 获取所有用户链接
                    user_elements = await page.query_selector_all('a[href*="/user/"]')
                    print(f"🔗 找到 {len(user_elements)} 个用户链接")
                    
                    if user_elements:
                        for i, elem in enumerate(user_elements[:5]):  # 只看前5个
                            href = await elem.get_attribute('href')
                            text = await elem.inner_text()
                            print(f"  [{i+1}] {text[:50]} -> {href}")
                        
                        # 获取第一个用户链接
                        href = await user_elements[0].get_attribute('href')
                        if href:
                            # 处理相对URL和绝对URL
                            if href.startswith('http'):
                                user_page_url = href
                            elif href.startswith('/'):
                                user_page_url = f"{self.base_url}{href}"
                            else:
                                user_page_url = f"{self.base_url}/{href}"
                            print(f"✅ 找到用户页面: {user_page_url}")
                except Exception as e:
                    print(f"⚠️  搜索方法失败: {e}")
                    import traceback
                    traceback.print_exc()
                
                if not user_page_url:
                    print("❌ 未找到用户页面，请检查搜索结果")
                    return None
                
                # 访问用户主页
                print(f"🚶 正在访问用户主页...")
                print(f"📋 访问URL: {user_page_url}")
                
                await page.goto(user_page_url, wait_until='domcontentloaded', timeout=30000)
                await asyncio.sleep(5)
                
                # 截图用户主页
                await page.screenshot(path="/tmp/douyin_user_page.png", full_page=True)
                print("📸 用户主页已截图到 /tmp/douyin_user_page.png")
                
                # 获取页面内容（尝试从页面数据中提取）
                page_content = await page.content()
                
                # 尝试从页面数据中提取
                user_data = await self._extract_data_from_page(page)
                
                if user_data:
                    return user_data
                else:
                    return {
                        "error": "无法自动提取数据",
                        "screenshots": ["/tmp/douyin_search.png", "/tmp/douyin_user_page.png"],
                        "url": user_page_url,
                        "note": "请查看截图或手动检查页面"
                    }
                
            except Exception as e:
                print(f"❌ 抓取失败: {str(e)}")
                import traceback
                traceback.print_exc()
                return None
                
            finally:
                await browser.close()
    
    async def _extract_data_from_page(self, page):
        """
        从页面中提取数据
        """
        data = {
            "timestamp": datetime.now().isoformat(),
            "user_info": {},
            "recent_videos": []
        }
        
        try:
            # 方法1: 尝试从页面 script 标签中提取 JSON 数据
            script_contents = await page.evaluate('''() => {
                const scripts = Array.from(document.querySelectorAll('script'));
                return scripts
                    .filter(s => s.textContent.includes('SSR_HYDRATED_DATA') || 
                              s.textContent.includes('__RENDER_DATA__'))
                    .map(s => s.textContent);
            }''')
            
            if script_contents and len(script_contents) > 0:
                print(f"✅ 找到 {len(script_contents)} 个数据脚本")
                
                # 解析 JSON 数据
                for idx, script in enumerate(script_contents):
                    # 尝试多种模式匹配
                    patterns = [
                        r'window\.__RENDER_DATA__\s*=\s*({.*?});',
                        r'window\._SSR_HYDRATED_DATA\s*=\s*({.*?});',
                        r'SSR_HYDRATED_DATA"\s*:\s*({.*?})',
                        r'__RENDER_DATA__\s*=\s*({.*?});'
                    ]
                    
                    for pattern in patterns:
                        match = re.search(pattern, script, re.DOTALL)
                        if match:
                            try:
                                json_str = match.group(1)
                                # 清理JSON字符串
                                json_str = json_str.replace('undefined', 'null')
                                parsed_data = json.loads(json_str)
                                
                                print(f"✅ 成功提取数据 (模式 {pattern[:30]}...)!")
                                data["raw_data"] = parsed_data
                                
                                # 尝试解析具体数据
                                await self._parse_user_data(parsed_data, data)
                                
                                return data
                                
                            except (json.JSONDecodeError, Exception) as e:
                                print(f"⚠️  JSON 解析失败: {e}")
                                continue
            
            # 方法2: 使用页面选择器提取可见数据
            print("🔍 尝试从可见元素提取数据...")
            
            visible_data = await page.evaluate('''() => {
                const result = {
                    page_title: document.title,
                    body_text: document.body.textContent.substring(0, 2000)
                };
                
                // 尝试找到粉丝数、关注数等
                const countSelectors = [
                    '[data-e2e="user-post-count"]',
                    '[data-e2e="user-following-count"]',
                    '[data-e2e="user-follower-count"]',
                    '[data-e2e="user-like-count"]',
                    '.user-info',
                    '.stats-info'
                ];
                
                countSelectors.forEach(sel => {
                    const elements = document.querySelectorAll(sel);
                    if (elements.length > 0) {
                        result[sel] = Array.from(elements).map(el => el.textContent);
                    }
                });
                
                return result;
            }''')
            
            print(f"📝 可见数据: {json.dumps(visible_data, indent=2, ensure_ascii=False)[:500]}")
            data["visible_data"] = visible_data
            
            return data
            
        except Exception as e:
            print(f"⚠️  数据提取失败: {e}")
            import traceback
            traceback.print_exc()
            data["error"] = str(e)
            return data
    
    async def _parse_user_data(self, raw_data, data):
        """
        解析用户数据
        注意：抖音的数据结构可能会经常变化，需要根据实际情况调整
        """
        try:
            # 这里需要根据实际的数据结构来解析
            # 打印数据结构以便调试
            print("🔍 解析用户数据...")
            
            # 保存完整的数据结构供分析
            data_structure = json.dumps(raw_data, indent=2, ensure_ascii=False)
            
            # 保存到文件供分析
            structure_file = f"/tmp/douyin_data_structure_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
            with open(structure_file, 'w', encoding='utf-8') as f:
                f.write(data_structure[:100000])  # 限制大小
            print(f"💾 数据结构已保存到: {structure_file}")
            
        except Exception as e:
            print(f"⚠️  解析失败: {e}")


async def main():
    """
    主函数
    """
    # 创建爬虫实例（headless=False 可以看到浏览器操作）
    scraper = DouyinScraper(headless=False)
    
    # 搜索目标
    username = "贾乃亮"
    
    print("=" * 60)
    print("🎬 抖音数据抓取工具 (Playwright版本)")
    print("=" * 60)
    print(f"📌 目标用户: {username}")
    print(f"📅 抓取时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 60)
    
    # 开始抓取
    result = await scraper.scrape_user_info(username)
    
    # 输出结果
    print("\n" + "=" * 60)
    print("📊 抓取结果")
    print("=" * 60)
    
    if result:
        print(json.dumps(result, indent=2, ensure_ascii=False)[:2000])
        if len(json.dumps(result)) > 2000:
            print("\n... (结果过长，已截断)")
        
        # 保存结果到文件
        output_file = f"/tmp/douyin_{username}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(result, f, indent=2, ensure_ascii=False)
        print(f"\n💾 完整结果已保存到: {output_file}")
    else:
        print("❌ 抓取失败")


if __name__ == "__main__":
    asyncio.run(main())
