#!/usr/bin/env python3
"""
抖音数据抓取工具 V3 - 用户账号专用版本
专门针对搜索用户账号和数据提取
"""

import asyncio
import json
import re
from playwright.async_api import async_playwright
from datetime import datetime


class DouyinUserScraper:
    def __init__(self, headless=False):
        self.headless = headless
        self.base_url = "https://www.douyin.com"
        
    async def search_user_account(self, username):
        """
        搜索用户账号
        """
        async with async_playwright() as p:
            browser = await p.chromium.launch(
                headless=self.headless,
                args=['--disable-blink-features=AutomationControlled']
            )
            
            # 使用桌面浏览器环境
            context = await browser.new_context(
                user_agent='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                viewport={'width': 1920, 'height': 1080}
            )
            
            page = await context.new_page()
            
            try:
                print(f"🔍 搜索用户: {username}")
                
                # 方法1: 尝试不同的搜索URL格式
                search_urls = [
                    f"{self.base_url}/search/{username}?type=user",
                    f"{self.base_url}/search/{username}",
                    f"https://www.douyin.com/search/user?keyword={username}",
                ]
                
                user_page_url = None
                
                for search_url in search_urls:
                    try:
                        print(f"📋 尝试搜索URL: {search_url}")
                        await page.goto(search_url, wait_until='domcontentloaded', timeout=20000)
                        await asyncio.sleep(5)
                        
                        # 截图
                        screenshot_num = search_urls.index(search_url) + 1
                        await page.screenshot(path=f"/tmp/douyin_search_{screenshot_num}.png", full_page=True)
                        
                        # 尝试找到用户卡片
                        user_found = await self._find_user_in_results(page, username)
                        if user_found:
                            user_page_url = user_found
                            print(f"✅ 找到用户主页: {user_page_url}")
                            break
                    except Exception as e:
                        print(f"⚠️  搜索失败: {e}")
                        continue
                
                if not user_page_url:
                    print("❌ 未找到用户主页，保存当前页面供分析")
                    await page.screenshot(path="/tmp/douyin_final_page.png", full_page=True)
                    
                    # 保存页面HTML
                    content = await page.content()
                    html_file = f"/tmp/douyin_page_{datetime.now().strftime('%Y%m%d_%H%M%S')}.html"
                    with open(html_file, 'w', encoding='utf-8') as f:
                        f.write(content)
                    print(f"💾 页面HTML已保存: {html_file}")
                    
                    return {
                        "status": "not_found",
                        "searched_username": username,
                        "screenshot": "/tmp/douyin_final_page.png",
                        "html_file": html_file,
                        "note": "未找到用户账号，请手动检查截图或HTML文件"
                    }
                
                # 访问用户主页
                print(f"🚶 访问用户主页: {user_page_url}")
                await page.goto(user_page_url, wait_until='domcontentloaded', timeout=30000)
                await asyncio.sleep(5)
                
                # 截图用户主页
                user_screenshot = f"/tmp/douyin_user_{datetime.now().strftime('%Y%m%d_%H%M%S')}.png"
                await page.screenshot(path=user_screenshot, full_page=True)
                print(f"📸 用户主页截图: {user_screenshot}")
                
                # 提取数据
                user_data = await self._extract_user_data(page)
                user_data['user_page_url'] = user_page_url
                user_data['screenshot'] = user_screenshot
                
                return user_data
                
            except Exception as e:
                print(f"❌ 抓取失败: {e}")
                import traceback
                traceback.print_exc()
                return None
            finally:
                await browser.close()
    
    async def _find_user_in_results(self, page, username):
        """
        从搜索结果中找到用户链接
        """
        try:
            # 等待页面加载
            await asyncio.sleep(2)
            
            # 查找所有包含 /user/ 的链接
            user_links = await page.evaluate('''(username) => {
                const links = [];
                
                // 查找所有链接
                const allLinks = document.querySelectorAll('a');
                
                allLinks.forEach(link => {
                    const href = link.getAttribute('href');
                    if (!href) return;
                    
                    // 检查是否是用户链接
                    if (href.includes('/user/') || href.includes('sec_user_id') || href.includes('user_id')) {
                        const text = link.textContent.trim();
                        // 检查是否包含用户名
                        if (text.includes(username) || text.length < 100) {
                            links.push({
                                href: href,
                                text: text.substring(0, 100)
                            });
                        }
                    }
                });
                
                // 去重
                const seen = new Set();
                return links.filter(link => {
                    const key = link.href;
                    if (seen.has(key)) return false;
                    seen.add(key);
                    return true;
                });
            }''', username)
            
            if user_links:
                print(f"\n📋 找到 {len(user_links)} 个可能的用户链接:")
                for i, link in enumerate(user_links[:10]):
                    print(f"  [{i+1}] {link['text'][:50]}")
                    print(f"      {link['href'][:100]}")
                
                # 返回第一个用户链接（通常是最相关的）
                first_link = user_links[0]['href']
                
                # 处理相对URL
                if first_link.startswith('/'):
                    return f"{self.base_url}{first_link}"
                elif first_link.startswith('http'):
                    return first_link
                else:
                    return f"{self.base_url}/{first_link}"
            
            return None
            
        except Exception as e:
            print(f"⚠️  查找用户链接失败: {e}")
            return None
    
    async def _extract_user_data(self, page):
        """
        从用户主页提取数据
        """
        data = {
            "timestamp": datetime.now().isoformat(),
            "user_info": {},
            "stats": {},
            "videos": []
        }
        
        try:
            print("🔍 提取用户数据...")
            
            # 1. 获取页面源码
            page_content = await page.content()
            
            # 2. 尝试从 script 标签提取渲染数据
            script_data = await page.evaluate('''() => {
                const result = {
                    render_data: null,
                    ssr_data: null
                };
                
                // 查找 __RENDER_DATA__
                const renderScript = Array.from(document.querySelectorAll('script')).find(s => 
                    s.textContent.includes('__RENDER_DATA__')
                );
                
                if (renderScript) {
                    const match = renderScript.textContent.match(/__RENDER_DATA__\s*=\s*({.+?});/);
                    if (match) {
                        try {
                            result.render_data = JSON.parse(match[1]);
                        } catch (e) {
                            result.render_data = 'parse_error';
                        }
                    }
                }
                
                // 查找 _SSR_HYDRATED_DATA
                const ssrScript = Array.from(document.querySelectorAll('script')).find(s => 
                    s.textContent.includes('_SSR_HYDRATED_DATA')
                );
                
                if (ssrScript) {
                    const match = ssrScript.textContent.match(/_SSR_HYDRATED_DATA\s*=\s*({.+?});/);
                    if (match) {
                        try {
                            result.ssr_data = JSON.parse(match[1]);
                        } catch (e) {
                            result.ssr_data = 'parse_error';
                        }
                    }
                }
                
                return result;
            }''')
            
            if script_data['render_data']:
                print("✅ 找到 RENDER_DATA")
                data['render_data'] = script_data['render_data']
                # 这里可以进一步解析具体的数据结构
                
            if script_data['ssr_data']:
                print("✅ 找到 SSR_HYDRATED_DATA")
                data['ssr_data'] = script_data['ssr_data']
            
            # 3. 从可见元素提取数据
            visible_stats = await page.evaluate('''() => {
                const result = {};
                
                // 查找所有包含数字的元素（可能是粉丝数、作品数等）
                const allElements = document.querySelectorAll('*');
                const numbersWithText = [];
                
                allElements.forEach(el => {
                    const text = el.textContent.trim();
                    // 匹配模式：粉丝、关注、获赞、作品 + 数字
                    if (/^(粉丝|关注|获赞|作品|点赞)/.test(text)) {
                        const parent = el.parentElement;
                        if (parent) {
                            const value = parent.textContent.trim();
                            numbersWithText.push(value);
                        }
                    }
                });
                
                result.stats_text = numbersWithText;
                
                // 获取页面标题和基本信息
                result.page_title = document.title;
                result.url = window.location.href;
                
                return result;
            }''')
            
            data['visible_stats'] = visible_stats
            
            # 4. 使用正则表达式从HTML中提取数据
            patterns = {
                '粉丝': r'[粉丝]?数[：:\s]*(\d+(?:\.\d+)?[万千百万]?)',
                '关注': r'[关注]?数[：:\s]*(\d+(?:\.\d+)?[万千百万]?)',
                '获赞': r'[获赞]?数[：:\s]*(\d+(?:\.\d+)?[万千百万]?)',
                '作品': r'[作品]?数[：:\s]*(\d+(?:\.\d+)?[万千百万]?)',
            }
            
            extracted = {}
            for key, pattern in patterns.items():
                matches = re.findall(pattern, page_content)
                if matches:
                    extracted[key] = matches[:3]
            
            data['regex_stats'] = extracted
            
            return data
            
        except Exception as e:
            print(f"⚠️  数据提取失败: {e}")
            import traceback
            traceback.print_exc()
            data['error'] = str(e)
            return data


async def main():
    """
    主函数
    """
    print("=" * 70)
    print("🎬 抖音用户数据抓取工具 V3")
    print("=" * 70)
    print(f"📅 时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 70)
    
    scraper = DouyinUserScraper(headless=False)
    
    # 搜索目标
    username = "贾乃亮"
    
    print(f"\n🎯 目标用户: {username}\n")
    
    result = await scraper.search_user_account(username)
    
    print("\n" + "=" * 70)
    print("📊 抓取结果")
    print("=" * 70)
    
    if result:
        # 打印摘要
        print(f"\n状态: {result.get('status', 'unknown')}")
        print(f"用户主页: {result.get('user_page_url', 'N/A')}")
        print(f"截图: {result.get('screenshot', 'N/A')}")
        
        if 'visible_stats' in result:
            print(f"\n可见统计数据: {json.dumps(result['visible_stats'], indent=2, ensure_ascii=False)[:500]}")
        
        # 保存完整结果
        output_file = f"/tmp/douyin_result_{username}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(result, f, indent=2, ensure_ascii=False)
        
        print(f"\n💾 完整结果已保存: {output_file}")
    
    print("\n" + "=" * 70)
    print("✅ 完成!")
    print("=" * 70)


if __name__ == "__main__":
    asyncio.run(main())
