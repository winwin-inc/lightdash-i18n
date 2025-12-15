import { useEffect, useState } from 'react';
// 直接引入 weixin-js-sdk
// 注意：在某些构建环境下可能不会自动挂载到 window.wx，所以手动确保挂载
import wx from 'weixin-js-sdk';

// 确保 wx 挂载到全局（某些构建环境可能不会自动挂载）
if (typeof window !== 'undefined' && !(window as any).wx) {
    (window as any).wx = wx;
}

// 获取 wx.miniProgram 对象
const getWxMiniProgram = () => (window as any).wx?.miniProgram;

/**
 * Hook to detect if the current page is running in WeChat Mini Program environment
 * and provide utilities to interact with the mini program
 */
export const useWeChatMiniProgram = () => {
    const [isMiniProgram, setIsMiniProgram] = useState(false);
    const [isReady, setIsReady] = useState(false);

    useEffect(() => {
        const miniProgram = getWxMiniProgram();

        if (miniProgram) {
            miniProgram.getEnv((res: { miniprogram: boolean }) => {
                setIsMiniProgram(res.miniprogram);
                setIsReady(true);
            });
        } else {
            // 如果 wx.miniProgram 不可用，直接设置为就绪（非小程序环境）
            setIsReady(true);
        }
    }, []);

    const navigateBack = (delta: number = 1) => {
        if (!isMiniProgram) return;

        const miniProgram = getWxMiniProgram();
        if (miniProgram) {
            miniProgram.navigateBack({ delta });
        }
    };

    return {
        isMiniProgram,
        isReady,
        navigateBack,
    };
};

/**
 * Hook to handle browser back button in WeChat Mini Program
 * Automatically navigates back to mini program when user clicks back button
 */
export const useWeChatMiniProgramBackHandler = () => {
    const { isMiniProgram, isReady } = useWeChatMiniProgram();

    useEffect(() => {
        if (!isMiniProgram || !isReady) return;

        const miniProgram = getWxMiniProgram();
        if (!miniProgram) return;

        // 记录初始 history 长度
        const initialHistoryLength = window.history.length;
        let lastHistoryLength = initialHistoryLength;

        // Push a state to enable popstate detection
        window.history.pushState({ isWeChatMiniProgram: true }, '');

        // 方法1: 监听 popstate 事件（标准方式）
        const handlePopState = (_event: PopStateEvent) => {
            miniProgram.navigateBack({ delta: 1 });
        };

        // 方法2: 监听 pageshow 事件（微信 WebView 中更可靠）
        const handlePageShow = (event: PageTransitionEvent) => {
            // 如果页面是从缓存恢复的，可能是返回操作
            if (event.persisted) {
                miniProgram.navigateBack({ delta: 1 });
            }
        };

        // 方法3: 监听 visibilitychange 事件（页面隐藏时可能是返回操作）
        const handleVisibilityChange = () => {
            if (document.hidden) {
                // 页面隐藏时，检查是否是返回操作
                // 延迟执行，避免误触发
                setTimeout(() => {
                    if (
                        document.hidden &&
                        window.history.length <= initialHistoryLength
                    ) {
                        miniProgram.navigateBack({ delta: 1 });
                    }
                }, 100);
            }
        };

        // 方法4: 定期检查 history 长度变化（兜底方案）
        const checkHistoryChange = () => {
            const currentLength = window.history.length;
            // 如果 history 长度减少，说明用户点击了返回
            if (currentLength < lastHistoryLength) {
                lastHistoryLength = currentLength;
                miniProgram.navigateBack({ delta: 1 });
            }
        };

        const historyCheckInterval = setInterval(checkHistoryChange, 100);

        // 注册所有事件监听器
        window.addEventListener('popstate', handlePopState);
        window.addEventListener('pageshow', handlePageShow);
        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            window.removeEventListener('popstate', handlePopState);
            window.removeEventListener('pageshow', handlePageShow);
            document.removeEventListener(
                'visibilitychange',
                handleVisibilityChange,
            );
            clearInterval(historyCheckInterval);
        };
    }, [isMiniProgram, isReady]);
};
