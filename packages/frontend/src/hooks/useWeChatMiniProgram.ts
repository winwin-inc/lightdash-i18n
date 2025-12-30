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
 *
 * 在微信小程序嵌套场景下，用户点击回退按钮应该直接退出到小程序，
 * 而不是在应用内部的历史记录中回退。
 */
export const useWeChatMiniProgramBackHandler = () => {
    const { isMiniProgram, isReady } = useWeChatMiniProgram();

    useEffect(() => {
        if (!isMiniProgram || !isReady) return;

        const miniProgram = getWxMiniProgram();
        if (!miniProgram) return;

        let isNavigatingBack = false;
        let lastHistoryLength = window.history.length;
        let visibilityTimeout: NodeJS.Timeout | null = null;
        let isPageUnloading = false;

        // 清除 visibilityTimeout 定时器
        const clearVisibilityTimeout = () => {
            if (visibilityTimeout) {
                clearTimeout(visibilityTimeout);
                visibilityTimeout = null;
            }
        };

        // 安全地调用 navigateBack，添加错误处理和状态检查
        const safeNavigateBack = () => {
            // 如果已经在导航中，或者页面正在卸载，不执行
            if (isNavigatingBack || isPageUnloading) return;

            // 检查 miniProgram 是否还存在
            const currentMiniProgram = getWxMiniProgram();
            if (!currentMiniProgram) return;

            try {
                isNavigatingBack = true;
                currentMiniProgram.navigateBack({ delta: 1 });
            } catch (error) {
                // 捕获错误，避免影响其他逻辑
                console.warn('Failed to navigate back:', error);
                // 重置标志，允许后续重试
                isNavigatingBack = false;
            }
        };

        // 监听页面卸载事件，防止在卸载时调用 navigateBack
        const handleBeforeUnload = () => {
            isPageUnloading = true;
        };

        // 方法1: 监听 popstate 事件（标准方式）
        // 在微信小程序嵌套场景下，任何回退操作都应该直接退出到小程序
        const handlePopState = (_event: PopStateEvent) => {
            if (isPageUnloading) return;
            safeNavigateBack();
        };

        // 方法2: 监听 pageshow 事件（微信 WebView 中更可靠）
        const handlePageShow = (event: PageTransitionEvent) => {
            // 如果页面是从缓存恢复的，可能是返回操作
            if (event.persisted && !isPageUnloading) {
                safeNavigateBack();
            }
        };

        // 方法3: 监听 visibilitychange 事件（页面隐藏时可能是返回操作）
        const handleVisibilityChange = () => {
            // 清除之前的定时器
            clearVisibilityTimeout();

            if (document.hidden && !isPageUnloading) {
                // 页面隐藏时，检查是否是返回操作
                // 延迟执行，避免误触发（比如用户只是切换了应用）
                visibilityTimeout = setTimeout(() => {
                    // 如果页面仍然隐藏，且 history 长度减少，可能是返回操作
                    if (
                        !isPageUnloading &&
                        document.hidden &&
                        window.history.length < lastHistoryLength
                    ) {
                        safeNavigateBack();
                    }
                }, 100);
            } else if (!document.hidden) {
                // 页面重新可见时，更新 history 长度记录
                lastHistoryLength = window.history.length;
                // 重置导航标志，允许下次回退
                isNavigatingBack = false;
            }
        };

        // 方法4: 定期检查 history 长度变化（兜底方案）
        // 在某些情况下，popstate 可能不会触发，通过检查 history 长度变化来捕获回退操作
        // 使用较长的间隔（500ms）以减少性能开销，因为这是兜底方案
        const checkHistoryChange = () => {
            if (isNavigatingBack || isPageUnloading) return;

            const currentLength = window.history.length;
            // 如果 history 长度减少，说明用户点击了返回
            if (currentLength < lastHistoryLength) {
                safeNavigateBack();
            } else if (currentLength > lastHistoryLength) {
                // 如果 history 长度增加，更新记录（可能是前进操作或新页面）
                lastHistoryLength = currentLength;
                // 重置导航标志，允许下次回退
                isNavigatingBack = false;
            }
        };

        // 使用 500ms 间隔而不是 100ms，减少性能开销
        // 因为这是兜底方案，主要依赖 popstate 事件
        const historyCheckInterval = setInterval(checkHistoryChange, 500);

        // 注册事件监听器
        window.addEventListener('popstate', handlePopState);
        window.addEventListener('pageshow', handlePageShow);
        window.addEventListener('beforeunload', handleBeforeUnload);
        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            window.removeEventListener('popstate', handlePopState);
            window.removeEventListener('pageshow', handlePageShow);
            window.removeEventListener('beforeunload', handleBeforeUnload);
            document.removeEventListener(
                'visibilitychange',
                handleVisibilityChange,
            );
            clearInterval(historyCheckInterval);
            clearVisibilityTimeout();
            isPageUnloading = true; // 标记页面正在卸载
        };
    }, [isMiniProgram, isReady]);
};
