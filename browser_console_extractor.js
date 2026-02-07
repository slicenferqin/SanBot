/**
 * 抖音数据提取脚本 - 浏览器控制台版
 *
 * 使用方法：
 * 1. 打开 https://www.douyin.com 并登录你的账号
 * 2. 搜索"贾乃亮"并进入他的主页
 * 3. 按 F12 打开开发者工具，切换到 Console 标签
 * 4. 复制整个脚本粘贴到控制台
 * 5. 按回车执行
 * 6. 结果会自动复制到剪贴板，粘贴给我即可
 */

(function() {
    console.log('🔍 开始提取抖音数据...\n');

    const result = {
        timestamp: new Date().toISOString(),
        source: 'douyin_console_extractor',
        data: {}
    };

    try {
        // 提取用户基本信息
        const userData = window.__INITIAL_STATE__?.UserService?.user;
        const userInfo = window._SSR_HYDRATED_DATA?.data?.user;

        console.log('📊 提取用户信息...');

        if (userData || userInfo) {
            const user = userData || userInfo;

            result.data.user = {
                nickname: user.nickname || user.user?.nickname,
                unique_id: user.unique_id || user.user?.unique_id,
                uid: user.uid || user.user?.uid,
                sec_uid: user.sec_uid || user.user?.sec_uid,
                signature: user.signature || user.user?.signature,
                follower_count: user.follower_count || user.user?.follower_count,
                following_count: user.following_count || user.user?.following_count,
                aweme_count: user.aweme_count || user.user?.aweme_count,
                total_favorited: user.total_favorited || user.user?.total_favorited,
                verification: user.verification_info || user.user?.verification_info
            };

            console.log('✅ 用户信息:', result.data.user);
        } else {
            console.log('⚠️ 未找到用户信息，尝试从页面提取...');

            // 备用方案：从页面 DOM 提取
            const nickname = document.querySelector('.user-info .nickname')?.textContent;
            const followerCount = document.querySelector('.follower-count')?.textContent;
            const awemeCount = document.querySelector('.aweme-count')?.textContent;

            if (nickname) {
                result.data.user = {
                    nickname: nickname,
                    follower_count: followerCount,
                    aweme_count: awemeCount
                };
                console.log('✅ 从页面提取:', result.data.user);
            }
        }

        // 提取视频列表
        console.log('\n📺 提取视频列表...');

        // 尝试从全局状态获取
        const videoData = window.__INITIAL_STATE__?.VideoService?.videoList;
        const postList = window._SSR_HYDRATED_DATA?.data?.aweme?.list;

        const videos = videoData || postList || [];

        if (videos.length > 0) {
            console.log(`✅ 找到 ${videos.length} 个视频`);

            result.data.videos = videos.slice(0, 10).map((video, idx) => {
                const v = video.aweme || video;
                return {
                    index: idx + 1,
                    aweme_id: v.aweme_id,
                    desc: v.desc,
                    create_time: v.create_time ? new Date(v.create_time * 1000).toISOString() : null,
                    statistics: {
                        digg_count: v.statistics?.digg_count,
                        comment_count: v.statistics?.comment_count,
                        share_count: v.statistics?.share_count,
                        play_count: v.statistics?.play_count
                    },
                    video_url: v.video?.play_addr?.url_list?.[0],
                    cover_url: v.video?.cover?.url_list?.[0]
                };
            });

            console.log('✅ 视频列表:', result.data.videos);
        } else {
            console.log('⚠️ 未找到视频列表');
            console.log('💡 尝试滚动页面加载更多视频...');

            // 尝试触发滚动加载
            let scrollCount = 0;
            const scrollInterval = setInterval(() => {
                window.scrollBy(0, 1000);
                scrollCount++;

                if (scrollCount >= 10) {
                    clearInterval(scrollInterval);

                    // 等待加载后重新提取
                    setTimeout(() => {
                        console.log('🔄 重新提取数据...');
                        // 可以递归调用或提示用户手动再次运行
                    }, 2000);
                }
            }, 500);
        }

        // 提取额外的状态数据
        console.log('\n🔧 提取状态数据...');
        result.data._debug = {
            hasInitialState: !!window.__INITIAL_STATE__,
            hasSSRData: !!window._SSR_HYDRATED_DATA,
            hasUserData: !!userData,
            hasVideoData: !!videoData,
            url: window.location.href,
            pageTitle: document.title
        };

        console.log('✅ 状态数据:', result.data._debug);

    } catch (error) {
        console.error('❌ 提取失败:', error);
        result.error = error.message;
        result.stack = error.stack;
    }

    // 格式化输出
    const jsonString = JSON.stringify(result, null, 2);
    console.log('\n' + '='.repeat(60));
    console.log('📋 提取结果:');
    console.log('='.repeat(60));
    console.log(jsonString);
    console.log('='.repeat(60));

    // 复制到剪贴板
    try {
        navigator.clipboard.writeText(jsonString).then(() => {
            console.log('\n✅ 结果已复制到剪贴板！');
            console.log('💡 直接粘贴给 AI 即可');
        }).catch(err => {
            console.log('\n⚠️ 自动复制失败，请手动复制上面的 JSON');
        });
    } catch (err) {
        console.log('\n⚠️ 无法自动复制，请手动复制上面的 JSON');
    }

    // 返回结果
    return result;
})();
