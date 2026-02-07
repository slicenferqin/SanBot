#!/usr/bin/env python3
"""
增强版 Playwright 浏览器自动化
使用 stealth 技术，避免被检测为自动化工具
"""
import asyncio
import json
import random
from playwright.async_api import async_playwright

class StealthBrowser:
    """隐身浏览器 - 模拟真实用户行为"""
    
    def __init__(self, headless=False):
        self.headless = headless
        self.browser = None
        self.context = None
        self.page = None
        
    async def start(self):
        """启动浏览器"""
        playwright = await async_playwright().start()
        
        # 使用持久化上下文，可以保存登录状态
        self.context = await playwright.chromium.launch_persistent_context(
            user_data_dir="./douyin_session",
            headless=self.headless,
            args=[
                # 禁用自动化检测
                '--disable-blink-features=AutomationControlled',
                '--disable-dev-shm-usage',
                '--disable-background-timer-throttling',
                '--disable-backgrounding-occluded-windows',
                '--disable-renderer-backgrounding',
                '--disable-features=IsolateOrigins,site-per-process',
                # 添加更多伪装参数
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-web-security',
                '--disable-features=VizDisplayCompositor',
            ],
            viewport={'width': 1920, 'height': 1080},
            user_agent='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            locale='zh-CN',
            timezone_id='Asia/Shanghai',
        )
        
        self.page = await self.context.new_page()
        
        # 注入反检测脚本
        await self._inject_stealth_scripts()
        
        return self.page
    
    async def _inject_stealth_scripts(self):
        """注入反检测脚本"""
        stealth_script = """
        // 覆盖 navigator.webdriver
        Object.defineProperty(navigator, 'webdriver', {
            get: () => false,
        });
        
        // 覆盖 chrome 对象
        window.chrome = {
            runtime: {},
        };
        
        // 覆盖 permissions
        const originalQuery = window.navigator.permissions.query;
        window.navigator.permissions.query = (parameters) => (
            parameters.name === 'notifications' ?
                Promise.resolve({ state: Notification.permission }) :
                originalQuery(parameters)
        );
        
        // 覆盖 plugins 长度
        Object.defineProperty(navigator, 'plugins', {
            get: () => [1, 2, 3, 4, 5],
        });
        
        // 覆盖 languages
        Object.defineProperty(navigator, 'languages', {
            get: () => ['zh-CN', 'zh', 'en'],
        });
        
        // 添加真实的 Chrome 对象
        Object.defineProperty(navigator, 'userAgent', {
            get: () => 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        });
        """
        
        await self.page.add_init_script(stealth_script)
    
    async def human_like_scroll(self, distance=300):
        """模拟人类滚动行为"""
        # 随机滚动步长
        steps = random.randint(3, 8)
        step_distance = distance // steps
        
        for i in range(steps):
            await self.page.evaluate(f'window.scrollBy(0, {step_distance})')
            # 随机延迟 100-500ms
            await asyncio.sleep(random.uniform(0.1, 0.5))
    
    async def human_like_click(self, selector):
        """模拟人类点击行为"""
        # 先移动到元素附近
        element = await self.page.query_selector(selector)
        if element:
            box = await element.bounding_box()
            if box:
                # 添加随机偏移
                x = box['x'] + box['width'] / 2 + random.uniform(-5, 5)
                y = box['y'] + box['height'] / 2 + random.uniform(-5, 5)
                
                # 模拟人类移动鼠标
                await self.page.mouse.move(x, y)
                await asyncio.sleep(random.uniform(0.1, 0.3))
                
                # 点击
                await self.page.mouse.click(x, y)
    
    async def random_delay(self, min_sec=1, max_sec=3):
        """随机延迟"""
        await asyncio.sleep(random.uniform(min_sec, max_sec))
    
    async def save_cookies(self, filepath='cookies.json'):
        """保存 cookies"""
        cookies = await self.context.cookies()
        with open(filepath, 'w') as f:
            json.dump(cookies, f)
        print(f"✅ Cookies 已保存到 {filepath}")
    
    async def load_cookies(self, filepath='cookies.json'):
        """加载 cookies"""
        try:
            with open(filepath, 'r') as f:
                cookies = json.load(f)
            await self.context.add_cookies(cookies)
            print(f"✅ Cookies 已从 {filepath} 加载")
            return True
        except FileNotFoundError:
            print(f"⚠️  Cookie 文件不存在: {filepath}")
            return False
    
    async def close(self):
        """关闭浏览器"""
        if self.context:
            await self.context.close()


async def main():
    """测试脚本"""
    print("🚀 启动隐身浏览器...")
    
    browser = StealthBrowser(headless=False)
    page = await browser.start()
    
    # 访问抖音
    print("📱 正在访问抖音...")
    await page.goto('https://www.douyin.com', wait_until='networkidle')
    
    # 等待一段时间，让用户手动登录
    print("\n" + "="*60)
    print("⏳ 浏览器已启动，请手动完成以下步骤：")
    print("   1. 如果需要登录，请扫码登录")
    print("   2. 搜索'贾乃亮'")
    print("   3. 进入他的主页")
    print("   4. 等待页面完全加载")
    print("="*60)
    print("\n按 Enter 键继续，或输入 'q' 退出...")
    
    user_input = input()
    if user_input.lower() == 'q':
        await browser.close()
        return
    
    # 保存登录状态
    await browser.save_cookies('douyin_cookies.json')
    
    # 获取页面内容
    content = await page.content()
    print(f"\n✅ 页面标题: {await page.title()}")
    print(f"✅ 页面 URL: {page.url}")
    
    # 尝试提取数据
    print("\n📊 尝试提取用户信息...")
    
    # 查找粉丝数等数据
    try:
        # 等待页面加载
        await page.wait_for_timeout(3000)
        
        # 尝试不同的选择器
        selectors = [
            '[class*="follower"]',
            '[class*="fans"]',
            '[class*="like"]',
            'span[class*="count"]',
            'div[class*="user"]',
        ]
        
        for selector in selectors:
            elements = await page.query_selector_all(selector)
            if elements:
                print(f"\n找到 {len(elements)} 个 '{selector}' 元素:")
                for el in elements[:5]:  # 只显示前5个
                    text = await el.inner_text()
                    if text.strip():
                        print(f"  - {text[:100]}")
    except Exception as e:
        print(f"⚠️  提取数据时出错: {e}")
    
    print("\n✅ 完成！按 Enter 关闭浏览器...")
    input()
    
    await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
