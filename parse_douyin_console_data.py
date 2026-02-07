#!/usr/bin/env python3
"""
解析抖音控制台提取的数据
"""

import json
import sys
from datetime import datetime

def parse_douyin_data(json_str):
    """解析抖音 JSON 数据"""
    print("\n" + "="*60)
    print("📊 抖音数据分析报告")
    print("="*60)

    try:
        data = json.loads(json_str)

        # 提取用户信息
        user = data.get('data', {}).get('user', {})

        if user:
            print("\n" + "─"*60)
            print("👤 用户基本信息")
            print("─"*60)

            fields = {
                'nickname': ('昵称', str),
                'unique_id': ('抖音号', str),
                'uid': ('UID', str),
                'sec_uid': ('SEC_UID', str),
                'signature': ('简介', str),
                'follower_count': ('粉丝数', lambda x: f"{x:,}"),
                'following_count': ('关注数', lambda x: f"{x:,}"),
                'aweme_count': ('作品数', lambda x: f"{x:,}"),
                'total_favorited': ('总获赞', lambda x: f"{x:,}")
            }

            for key, (label, formatter) in fields.items():
                value = user.get(key)
                if value is not None:
                    try:
                        formatted_value = formatter(value)
                        print(f"  {label}: {formatted_value}")
                    except:
                        print(f"  {label}: {value}")

            print("─"*60)

        # 提取视频统计
        videos = data.get('data', {}).get('videos', [])

        if videos:
            print(f"\n{'─'*60}")
            print(f"📺 最近 {len(videos)} 个作品统计")
            print(f"{'─'*60}")

            total_likes = 0
            total_plays = 0
            total_comments = 0
            total_shares = 0

            for video in videos:
                stats = video.get('statistics', {})
                total_likes += stats.get('digg_count', 0) or 0
                total_plays += stats.get('play_count', 0) or 0
                total_comments += stats.get('comment_count', 0) or 0
                total_shares += stats.get('share_count', 0) or 0

                print(f"\n  📹 视频 #{video.get('index')}: {video.get('desc', '无标题')[:30]}")
                print(f"     👍 点赞: {stats.get('digg_count', 0):,}")
                print(f"     ▶️  播放: {stats.get('play_count', 0):,}")
                print(f"     💬 评论: {stats.get('comment_count', 0):,}")
                print(f"     🔗 分享: {stats.get('share_count', 0):,}")
                if video.get('create_time'):
                    print(f"     📅 发布: {video['create_time'][:10]}")

            print(f"\n{'─'*60}")
            print("📈 总计统计")
            print(f"{'─'*60}")
            print(f"  总点赞: {total_likes:,}")
            print(f"  总播放: {total_plays:,}")
            print(f"  总评论: {total_comments:,}")
            print(f"  总分享: {total_shares:,}")

            if len(videos) > 0:
                print(f"\n📊 平均数据:")
                print(f"  平均点赞: {total_likes // len(videos):,}")
                print(f"  平均播放: {total_plays // len(videos):,}")
                print(f"  平均评论: {total_comments // len(videos):,}")

            print(f"{'─'*60}")

            # 保存详细数据
            filename = f"douyin_analysis_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
            with open(filename, 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            print(f"\n💾 详细数据已保存: {filename}")

        else:
            print("\n⚠️ 未找到视频数据")
            debug = data.get('data', {}).get('_debug', {})
            if debug:
                print("\n🔧 调试信息:")
                print(json.dumps(debug, indent=2, ensure_ascii=False))

        return data

    except json.JSONDecodeError as e:
        print(f"❌ JSON 解析失败: {e}")
        print(f"请检查粘贴的数据格式是否正确")
        return None
    except Exception as e:
        print(f"❌ 解析失败: {e}")
        import traceback
        traceback.print_exc()
        return None

def main():
    print("📋 抖音数据分析工具")
    print("="*60)
    print("\n请按以下步骤操作:")
    print("1. 打开抖音网站 https://www.douyin.com")
    print("2. 搜索并进入贾乃亮的个人主页")
    print("3. 按 F12 打开开发者工具")
    print("4. 切换到 Console 标签")
    print("5. 复制 browser_console_extractor.js 的内容")
    print("6. 粘贴到控制台并按回车")
    print("7. 将输出的 JSON 复制并粘贴到这里")
    print("\n" + "="*60)

    if len(sys.argv) > 1:
        # 从文件读取
        try:
            with open(sys.argv[1], 'r', encoding='utf-8') as f:
                content = f.read()
                parse_douyin_data(content)
        except Exception as e:
            print(f"❌ 读取文件失败: {e}")
    else:
        # 从 stdin 读取
        print("\n📝 请粘贴 JSON 数据 (按 Ctrl+D 结束输入):")
        try:
            content = sys.stdin.read()
            if content.strip():
                parse_douyin_data(content)
            else:
                print("❌ 未输入任何数据")
        except KeyboardInterrupt:
            print("\n\n⚠️ 已取消")

if __name__ == "__main__":
    main()
