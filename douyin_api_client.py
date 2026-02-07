#!/usr/bin/env python3
"""
抖音移动端 API 客户端
尝试调用抖音的内部 API 获取用户数据
"""

import requests
import json
import time
import random
from datetime import datetime
from urllib.parse import quote

class DouyinAPIClient:
    def __init__(self):
        self.session = requests.Session()
        self.device_id = self._generate_device_id()
        
        # 移动端 headers
        self.headers = {
            'User-Agent': 'com.ss.android.ugc.aweme/280102 (Linux; U; Android 12; zh_CN; SM-G998B; Build/SP1A.210812.016; Cronet/TTNetVersion:6c7b701a 2021-08-10 QuicVersion:0144d358 2021-07-28)',
            'X-Khronos': str(int(time.time())),
            'X-Gorgon': '',  # 需要签名算法
            'X-Argus': '',   # 需要签名算法
            'X-SS-REQ-TICKET': str(int(time.time() * 1000)),
            'X-TT-TRACE-ID': self._generate_trace_id(),
            'X-SS-STUB': self._generate_stub(),
            'sdk-version': '2',
            'Cookie': f'device_web_cpu_core=8;device_web_memory_size=8;webid={self.device_id};'
        }
    
    def _generate_device_id(self):
        """生成设备 ID"""
        return ''.join([str(random.randint(0, 9)) for _ in range(19)])
    
    def _generate_trace_id(self):
        """生成追踪 ID"""
        return ''.join([str(random.randint(0, 9)) for _ in range(19)])
    
    def _generate_stub(self):
        """生成 stub"""
        return ''.join([str(random.randint(0, 9)) for _ in range(16)])
    
    def search_user_web(self, keyword):
        """使用网页版 API 搜索用户"""
        print(f"\n{'='*60}")
        print(f"🔍 搜索用户: {keyword}")
        print(f"{'='*60}\n")
        
        # 网页版搜索 API
        api_url = "https://www.douyin.com/aweme/v1/web/general/search/single/"
        params = {
            'device_platform': 'webapp',
            'aid': '6383',
            'channel': 'channel_pc_web',
            'search_channel': 'aweme_user_web',
            'keyword': keyword,
            'search_source': 'normal_search',
            'query_correct_type': '1',
            'is_filter_search': '0',
            'from_group_id': '',
            'offset': '0',
            'count': '10',
            'pc_client_type': '1',
            'version_code': '170400',
            'version_name': '17.4.0',
            'cookie_enabled': 'true',
            'screen_width': '1920',
            'screen_height': '1080',
            'browser_language': 'zh-CN',
            'browser_platform': 'MacIntel',
            'browser_name': 'Chrome',
            'browser_version': '131.0.0.0',
            'browser_online': 'true',
            'engine_name': 'Blink',
            'engine_version': '131.0.0.0',
            'os_name': 'Mac OS X',
            'os_version': '10.15.7',
            'cpu_core_num': '8',
            'device_memory': '8',
            'platform': 'MacIntel',
            'downlink': '10',
            'effective_type': '4g',
            'round_trip_time': '50',
            'webid': self.device_id,
            'msToken': '',
            'fp': '',
            '_signature': ''
        }
        
        headers = {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
            'Referer': 'https://www.douyin.com/',
            'Accept': 'application/json, text/plain, */*',
            'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
            'Accept-Encoding': 'gzip, deflate, br',
            'Cookie': f'passport_csrf_token=abc123; ttcid=abc123; webid={self.device_id};',
            'sec-ch-ua': '"Chromium";v="131", "Not_A Brand";v="24"',
            'sec-ch-ua-mobile': '?0',
            'sec-ch-ua-platform': '"macOS"',
            'sec-fetch-dest': 'empty',
            'sec-fetch-mode': 'cors',
            'sec-fetch-site': 'same-origin'
        }
        
        try:
            print(f"📍 请求 API: {api_url}")
            print(f"📋 参数: keyword={keyword}")
            
            response = self.session.get(
                api_url,
                params=params,
                headers=headers,
                timeout=10
            )
            
            print(f"\n✅ 状态码: {response.status_code}")
            print(f"📄 响应长度: {len(response.text)}")
            
            if response.status_code == 200:
                try:
                    data = response.json()
                    
                    # 保存响应
                    filename = f"douyin_api_{keyword}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
                    with open(filename, 'w', encoding='utf-8') as f:
                        json.dump(data, f, ensure_ascii=False, indent=2)
                    print(f"💾 响应已保存: {filename}")
                    
                    # 提取用户信息
                    self._parse_search_result(data)
                    
                    return data
                except json.JSONDecodeError:
                    print("❌ 响应不是有效的 JSON")
                    print(f"响应内容: {response.text[:500]}")
            else:
                print(f"❌ 请求失败: {response.status_code}")
                print(f"响应: {response.text[:500]}")
                
        except Exception as e:
            print(f"❌ 请求异常: {e}")
            import traceback
            traceback.print_exc()
        
        return None
    
    def _parse_search_result(self, data):
        """解析搜索结果"""
        print("\n" + "="*60)
        print("📊 解析搜索结果")
        print("="*60)
        
        try:
            # 尝试不同的数据路径
            user_list = None
            
            # 路径1: data.data -> user_list
            if 'data' in data and isinstance(data['data'], dict):
                if 'user_list' in data['data']:
                    user_list = data['data']['user_list']
            
            # 路径2: 直接在 data 中
            elif 'user_list' in data:
                user_list = data['user_list']
            
            # 路径3: 在 result 中
            elif 'result' in data and 'user_list' in data['result']:
                user_list = data['result']['user_list']
            
            if user_list:
                print(f"\n✅ 找到 {len(user_list)} 个用户:\n")
                
                for idx, user_data in enumerate(user_list[:5]):  # 只显示前5个
                    user = user_data.get('user', user_data)
                    self._print_user_info(user, idx + 1)
            else:
                print("❌ 未找到用户列表")
                print("📋 数据结构:")
                print(json.dumps(data, ensure_ascii=False, indent=2)[:1000])
                
        except Exception as e:
            print(f"❌ 解析失败: {e}")
            import traceback
            traceback.print_exc()
    
    def _print_user_info(self, user, index):
        """打印用户信息"""
        print(f"\n{'─'*60}")
        print(f"👤 用户 #{index}")
        print(f"{'─'*60}")
        
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
            'total_favorited': '总获赞',
            'verification_type': '认证类型',
            'custom_verify': '认证信息'
        }
        
        for key, label in fields.items():
            if key in user and user[key] is not None:
                value = user[key]
                if isinstance(value, int) and 'count' in key:
                    value = f"{value:,}"
                print(f"  {label}: {value}")
        
        # 保存 sec_uid 供后续使用
        if 'sec_uid' in user:
            print(f"\n  ✅ SEC_UID: {user['sec_uid']}")
            print(f"  💡 可以用这个 UID 获取用户详情和作品列表")
        
        print(f"{'─'*60}")

def main():
    client = DouyinAPIClient()
    
    # 搜索贾乃亮
    result = client.search_user_web("贾乃亮")
    
    if result:
        print("\n✅ 搜索完成!")
    else:
        print("\n❌ 搜索失败，尝试其他方法...")

if __name__ == "__main__":
    main()
