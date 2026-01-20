import { useCallback, useEffect, useState } from 'react';
import wx from 'weixin-js-sdk';

// 确保 wx 挂载到全局（某些构建环境可能不会自动挂载）
if (typeof window !== 'undefined' && !(window as any).wx) {
    (window as any).wx = wx;
}

// 获取 wx.miniProgram 对象
const getWxMiniProgram = () => (window as any).wx?.miniProgram;

// 获取 WeixinJSBridge 对象（用于关闭 webview）
const getWeixinJSBridge = () => (window as any).WeixinJSBridge;

// 调试日志前缀
const LOG_PREFIX = '[WeChatMiniProgram]';

// 格式化日志消息
export const formatLogMessage = (...args: unknown[]): string => {
    return args
        .map((arg) => {
            if (typeof arg === 'object') {
                try {
                    return JSON.stringify(arg);
                } catch {
                    return String(arg);
                }
            }
            return String(arg);
        })
        .join(' ');
};

export const log = {
    info: (...args: unknown[]) => {
        console.log(LOG_PREFIX, ...args);
    },
    warn: (...args: unknown[]) => {
        console.warn(LOG_PREFIX, ...args);
    },
    error: (...args: unknown[]) => {
        console.error(LOG_PREFIX, ...args);
    },
};

/**
 * Hook to detect if the current page is running in WeChat Mini Program environment
 * and provide utilities to interact with the mini program
 */
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
        log.info('Initializing WeChat Mini Program detection');
        const miniProgram = getWxMiniProgram();

        if (miniProgram) {
            log.info('wx.miniProgram found, checking environment');

            miniProgram.getEnv((res: { miniprogram: boolean }) => {
                log.info('Environment check result:', res);

                setIsMiniProgram(res.miniprogram);
                setIsReady(true);

                if (res.miniprogram) {
                    log.info('Running in WeChat Mini Program');
                } else {
                    log.info('Not running in WeChat Mini Program');
                }
            });
        } else {
            // 如果 wx.miniProgram 不可用，直接设置为就绪（非小程序环境）
            log.info(
                'wx.miniProgram not available, assuming non-mini-program environment',
            );
            setIsReady(true);
        }
    }, []);

    /**
     * 安全地调用微信小程序的 navigateBack 接口
     * 注意：在 webview 多次重定向的场景下，应该使用 delta: 1 直接返回小程序，
     * 而不是在 webview 内部回退，因为 navigateBack 是用于返回小程序页面的
     */
    const navigateBack = useCallback(
        (delta: number = 1) => {
            if (!isMiniProgram) {
                log.info(
                    'navigateBack called but not in mini program, ignoring',
                );
                return;
            }

            const miniProgram = getWxMiniProgram();
            if (!miniProgram) {
                log.warn('navigateBack called but miniProgram not available');
                return;
            }

            try {
                log.info(`Calling navigateBack with delta: ${delta}`);
                miniProgram.navigateBack({
                    delta,
                    success: () => {
                        log.info('navigateBack called successfully');
                    },
                    fail: (error: { errMsg: string }) => {
                        log.error('Failed to call navigateBack:', error);
                    },
                });
            } catch (error) {
                log.error('Failed to call navigateBack:', error);
            }
        },
        [isMiniProgram],
    );

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
 *
 * 注意：在 webview 多次重定向的场景下，navigateBack 应该使用 delta: 1
 * 直接返回小程序，而不是在 webview 内部回退。
 *
 * @param onNavigateBack - 可选的回调函数，在回退操作开始时调用（用于显示 toast 提示等）
 */
export const useWeChatMiniProgramBackHandler = (
    onNavigateBack?: () => void,
) => {
    const { isMiniProgram, isReady, navigateBack } = useWeChatMiniProgram();

    useEffect(() => {
        log.info('Setting up back handler', { isMiniProgram, isReady });

        if (!isMiniProgram || !isReady) {
            log.info(
                'Skipping back handler setup (not in mini program or not ready)',
            );
            return;
        }

        const miniProgram = getWxMiniProgram();
        if (!miniProgram) {
            log.warn('miniProgram not available, skipping back handler setup');
            return;
        }

        let isNavigatingBack = false;

        /**
         * 安全地调用回退操作
         * 参考实现：先关闭 webview，然后返回小程序
         */
        const safeNavigateBack = () => {
            // 防止重复调用
            if (isNavigatingBack) {
                log.info('Already navigating back, skipping');
                return;
            }

            log.info('safeNavigateBack 1', {
                isNavigatingBack,
                isMiniProgram,
                isReady,
            });

            isNavigatingBack = true;

            // 调用回调函数（用于显示 toast 提示等）
            if (onNavigateBack) {
                try {
                    onNavigateBack();
                } catch (error) {
                    log.warn('Error in onNavigateBack callback:', error);
                }
            }

            log.info('safeNavigateBack 2', {
                isNavigatingBack,
                isMiniProgram,
                isReady,
            });

            // 1. 尝试关闭 webview（如果 WeixinJSBridge 可用）
            const weixinJSBridge = getWeixinJSBridge();
            if (weixinJSBridge) {
                try {
                    log.info('Calling WeixinJSBridge.closeWindow');
                    weixinJSBridge.call('closeWindow');
                } catch (error) {
                    log.warn(
                        'Failed to call WeixinJSBridge.closeWindow:',
                        error,
                    );
                }
            }

            log.info('safeNavigateBack 3', {
                isNavigatingBack,
                isMiniProgram,
                isReady,
            });

            // 2. 调用小程序回退
            try {
                log.info('Calling navigateBack via hook');
                navigateBack(1);
            } catch (error) {
                // 捕获错误，避免影响其他逻辑
                log.error('Failed to navigate back:', error);
                // 重置标志，允许后续重试
                isNavigatingBack = false;
            }
        };

        // 监听 popstate 事件（标准方式）
        // 参考实现：popstate 事件触发时，直接关闭 webview 并返回小程序
        // 不需要再次 pushState，因为初始化时已经 pushState 了
        const handlePopState = (event: PopStateEvent) => {
            log.info('popstate event triggered', {
                state: event.state,
            });

            // 直接调用回退操作（关闭 webview 并返回小程序）
            safeNavigateBack();
        };

        /**
         * 初始化：使用 pushState 添加一个历史记录
         * 参考实现：pushState 必须和 popstate 配合使用
         * 这样当用户点击回退时，会先触发 popstate，而不是直接卸载页面
         *
         * 注意：使用 window.location.href 而不是 '#'，避免影响 URL 参数和重定向逻辑
         */
        const pushHistory = () => {
            try {
                // 保存当前完整的 URL，包括路径、查询参数和 hash
                // 这样不会影响其他逻辑（如重定向、URL 参数读取等）
                const currentUrl =
                    window.location.pathname +
                    window.location.search +
                    window.location.hash;
                const state = {
                    title: document.title || 'title',
                    url: currentUrl,
                    _wechat_intercept: true,
                };
                log.info('Pushing initial state for back interception', {
                    state,
                    currentUrl,
                });
                // pushState：向 history 中塞入一条历史记录
                // 使用当前 URL，这样不会改变地址栏，也不会影响其他逻辑
                window.history.pushState(state, state.title, currentUrl);
            } catch (error) {
                log.warn('Failed to push initial state:', error);
            }
        };

        // 初始化时调用 pushHistory
        pushHistory();

        // 注册事件监听器
        log.info('Registering event listeners');
        window.addEventListener('popstate', handlePopState);

        return () => {
            log.info('Cleaning up back handler');
            window.removeEventListener('popstate', handlePopState);
        };
    }, [isMiniProgram, isReady, navigateBack, onNavigateBack]);
};
