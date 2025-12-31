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
export const useWeChatMiniProgram = (): {
    isMiniProgram: boolean;
    isReady: boolean;
    navigateBack: (delta?: number) => void;
} => {
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
        if (!isMiniProgram || !isReady) {
            return;
        }

        const miniProgram = getWxMiniProgram();
        if (!miniProgram) {
            return;
        }

        let isNavigatingBack = false;
        let isPageUnloading = false;

        // 安全地调用 navigateBack，添加错误处理和状态检查
        const safeNavigateBack = () => {
            // 如果已经在导航中，或者页面正在卸载，不执行
            if (isNavigatingBack || isPageUnloading) {
                return;
            }

            // 检查 miniProgram 是否还存在
            const currentMiniProgram = getWxMiniProgram();
            if (!currentMiniProgram) {
                return;
            }

            try {
                isNavigatingBack = true;
                currentMiniProgram.navigateBack({ delta: 1 });
            } catch (error) {
                // 捕获错误，避免影响其他逻辑
                console.warn(
                    'Failed to navigate back in WeChat mini program:',
                    error,
                );
                // 重置标志，允许后续重试
                isNavigatingBack = false;
            }
        };

        // 监听页面卸载事件，防止在卸载时调用 navigateBack
        const handleBeforeUnload = () => {
            isPageUnloading = true;
        };

        // 监听 popstate 事件（标准方式）
        // 在微信小程序嵌套场景下，任何回退操作都应该直接退出到小程序
        const handlePopState = () => {
            if (isPageUnloading) {
                return;
            }

            // 立即阻止默认回退行为，并调用小程序回退
            // 使用 pushState 来恢复当前状态，防止页面回退
            try {
                const currentState = window.history.state;
                window.history.pushState(
                    currentState,
                    '',
                    window.location.href,
                );
            } catch (error) {
                // 如果 pushState 失败，仍然尝试调用小程序回退
                console.warn('Failed to push state:', error);
            }

            // 立即调用小程序回退
            safeNavigateBack();
        };

        // 初始化：使用 pushState 添加一个历史记录，以便后续可以拦截回退
        // 这样当用户点击回退时，会先触发 popstate，而不是直接卸载页面
        try {
            const currentState = window.history.state;
            window.history.pushState(
                { ...currentState, _wechat_intercept: true },
                '',
                window.location.href,
            );
        } catch (error) {
            console.warn('Failed to push initial state:', error);
        }

        // 注册事件监听器
        window.addEventListener('popstate', handlePopState);
        window.addEventListener('beforeunload', handleBeforeUnload);

        return () => {
            window.removeEventListener('popstate', handlePopState);
            window.removeEventListener('beforeunload', handleBeforeUnload);
            isPageUnloading = true; // 标记页面正在卸载
        };
    }, [isMiniProgram, isReady]);
};
