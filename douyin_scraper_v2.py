#!/usr/bin/env python3
"""
抖音数据抓取工具 V2 - 增强版
支持多种方式获取用户数据
"""

import asyncio
import json
import re
from playwright.async_api import async_playwright
from datetime import datetime


class DouyinScraperV2:
    def __init__(self, headless=False):
        self.headless = headless
        self.base_url = "https://www.douyin.com"
        
    async def scrape_by_direct_url(self, user_id, sec_user_id=None):
        """
        通过直接URL访问用户主页
        user_id: 数字ID
        sec_user_id: 加密的用户ID（可选）
        """
        async with async_playwright() as p:
            browser = await p.chromium.launch(
                headless=self.headless,
                args=[
                    '--disable-blink-features=AutomationControlled',
                ]
            )
            
            context = await browser.new_context(
                user_agent='Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
                viewport={'width': 390, 'height': 844}  # iPhone 尺寸
            )
            
            page = await context.new_page()
            
            try:
                # 构建用户主页URL
                if sec_user_id:
                    user_url = f"{self.base_url}/user/{sec_user_id}"
                else:
                    user_url = f"{self.base_url}/user/{user_id}"
                
                print(f"🚀 直接访问用户主页: {user_url}")
                
                await page.goto(user_url, wait_until='networkidle', timeout=30000)
                await asyncio.sleep(3)
                
                # 截图
                screenshot_path = f"/tmp/douyin_direct_{datetime.now().strftime('%Y%m%d_%H%M%S')}.png"
                await page.screenshot(path=screenshot_path, full_page=True)
                print(f"📸 截图已保存: {screenshot_path}")
                
                # 提取数据
                data = await self._extract_all_data(page)
                data['url'] = user_url
                data['screenshot'] = screenshot_path
                
                return data
                
            except Exception as e:
                print(f"❌ 错误: {e}")
                import traceback
                traceback.print_exc()
                return None
            finally:
                await browser.close()
    
    async def search_and_extract(self, keyword):
        """
        搜索并提取（改进版）
        """
        async with async_playwright() as p:
            browser = await p.chromium.launch(
                headless=self.headless,
                args=['--disable-blink-features=AutomationControlled']
            )
            
            context = await browser.new_context(
                user_agent='Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
                viewport={'width': 390, 'height': 844}
            )
            
            page = await context.new_page()
            
            try:
                # 使用移动端搜索
                search_url = f"{self.base_url}/search/{keyword}"
                print(f"🔍 搜索URL: {search_url}")
                
                await page.goto(search_url, wait_until='domcontentloaded', timeout=30000)
                await asyncio.sleep(5)
                
                # 截图
                await page.screenshot(path="/tmp/douyin_search_v2.png", full_page=True)
                print("📸 搜索结果已截图")
                
                # 尝试找到用户链接
                user_links = await page.evaluate('''() => {
                    const links = [];
                    const allLinks = document.querySelectorAll('a');
                    allLinks.forEach(link => {
                        const href = link.getAttribute('href');
                        const text = link.textContent.trim();
                        if (href && (href.includes('/user/') || text.includes('贾乃亮'))) {
                            links.push({
                                href: href,
                                text: text.substring(0, 50)
                            });
                        }
                    });
                    return links;
                }''')
                
                print(f"🔗 找到 {len(user_links)} 个相关链接:")
                for i, link in enumerate(user_links[:10]):
                    print(f"  [{i+1}] {link['text']} -> {link['href']}")
                
                # 保存结果
                result = {
                    "search_keyword": keyword,
                    "found_links": user_links,
                    "screenshot": "/tmp/douyin_search_v2.png",
                    "timestamp": datetime.now().isoformat()
                }
                
                return result
                
            except Exception as e:
                print(f"❌ 搜索失败: {e}")
                import traceback
                traceback.print_exc()
                return None
            finally:
                await browser.close()
    
    async def _extract_all_data(self, page):
        """
        提取所有可用数据
        """
        data = {
            "timestamp": datetime.now().isoformat(),
            "user_info": {},
            "stats": {},
            "recent_videos": []
        }
        
        try:
            # 1. 尝试从 script 标签提取渲染数据
            print("🔍 提取渲染数据...")
            render_data = await page.evaluate('''() => {
                // 查找包含数据的 script 标签
                const scripts = Array.from(document.querySelectorAll('script'));
                const dataScripts = scripts.filter(s => 
                    s.textContent.includes('__RENDER_DATA__') ||
                    s.textContent.includes('SSR_HYDRATED_DATA')
                );
                
                if (dataScripts.length > 0) {
                    return dataScripts[0].textContent.substring(0, 50000);
                }
                return null;
            }''')
            
            if render_data:
                # 保存原始数据
                data['raw_script'] = render_data
                
                # 尝试解析JSON
                patterns = [
                    r'__RENDER_DATA__\s*=\s*({.*?});\s*<\/script>',
                    r'_SSR_HYDRATED_DATA\s*=\s*({.*?});',
                    r'"data":\s*({.*?})\s*,"env"',
                ]
                
                for pattern in patterns:
                    match = re.search(pattern, render_data, re.DOTALL)
                    if match:
                        try:
                            json_str = match.group(1)
                            json_data = json.loads(json_str)
                            data['parsed_data'] = json_data
                            print("✅ 成功解析JSON数据!")
                            break
                        except:
                            continue
            
            # 2. 从页面元素提取可见数据
            print("🔍 提取可见数据...")
            visible_data = await page.evaluate('''() => {
                const result = {
                    title: document.title,
                    url: window.location.href
                };
                
                // 尝试多种选择器
                const selectors = {
                    // 抖音常见的数据选择器
                    'user-post-count': '[data-e2e="user-post-count"]',
                    'user-following-count': '[data-e2e="user-following-count"]',
                    'user-follower-count': '[data-e2e="user-follower-count"]',
                    'user-like-count': '[data-e2e="user-like-count"]',
                    // 通用选择器
                    'follower': '.follower-count, .fans-count, [class*="follower"], [class*="fans"]',
                    'following': '.following-count, [class*="following"]',
                    'works': '.works-count, .post-count, [class*="works"], [class*="post"]',
                    'likes': '.like-count, [class*="like"]',
                };
                
                for (key, selector) of Object.entries(selectors)) {
                    const elements = document.querySelectorAll(selector);
                    if (elements.length > 0) {
                        result[key] = Array.from(elements).map(el => el.textContent.trim());
                    }
                }
                
                // 获取页面前5000个字符用于分析
                result.body_preview = document.body.textContent.substring(0, 5000);
                
                return result;
            }''')
            
            data['visible_data'] = visible_data
            
            # 3. 使用正则表达式从页面源码中提取数字
            print("🔍 使用正则提取数据...")
            page_content = await page.content()
            
            # 查找可能的数据模式
            patterns = {
                'followers': r'粉丝[：:\s]*(\d+(?:\.\d+)?[万千万亿]?)',
                'following': r'关注[：:\s]*(\d+(?:\.\d+)?[万千万亿]?)',
                'likes': r'获赞[：:\s]*(\d+(?:\.\d+)?[万千万亿]?)',
                'works': r'作品[：:\s]*(\d+(?:\.\d+)?[万千万亿]?)',
            }
            
            extracted_stats = {}
            for key, pattern in patterns.items():
                matches = re.findall(pattern, page_content)
                if matches:
                    extracted_stats[key] = matches[:5]  # 只保留前5个匹配
            
            data['regex_extracted'] = extracted_stats
            
            return data
            
        except Exception as e:
            print(f"⚠️  数据提取失败: {e}")
            data['error'] = str(e)
            return data


async def main():
    """
    主函数 - 尝试多种方法
    """
    print("=" * 70)
    print("🎬 抖音数据抓取工具 V2 - 增强版")
    print("=" * 70)
    print(f"📅 时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 70)
    
    scraper = DouyinScraperV2(headless=False)
    
    # 方法1: 搜索
    print("\n【方法1】搜索贾乃亮")
    print("-" * 70)
    search_result = await scraper.search_and_extract("贾乃亮")
    
    if search_result:
        print("\n📊 搜索结果:")
        print(json.dumps(search_result, indent=2, ensure_ascii=False)[:1000])
        
        output_file = f"/tmp/douyin_search_result_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(search_result, f, indent=2, ensure_ascii=False)
        print(f"\n💾 已保存: {output_file}")
    
    # 方法2: 尝试已知的贾乃亮账号ID（如果有的话）
    # 注意：这些ID需要从实际数据中获取
    print("\n【方法2】直接访问（需要正确的用户ID）")
    print("-" * 70)
    print("⚠️  需要提供正确的用户ID (MS4wLjABAAAA...) 或数字ID")
    print("💡 提示：可以从搜索结果或分享链接中获取")
    
    print("\n" + "=" * 70)
    print("✅ 抓取完成!")
    print("=" * 70)
    print("\n📁 生成的文件:")
    print("  - /tmp/douyin_search_v2.png (搜索结果截图)")
    print("  - /tmp/douyin_search_result_*.json (搜索结果数据)")
    print("\n💡 建议:")
    print("  1. 查看截图找到正确的用户链接")
    print("  2. 从分享链接中提取 sec_user_id")
    print("  3. 使用正确的ID再次运行直接访问")


if __name__ == "__main__":
    asyncio.run(main())
