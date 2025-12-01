import { useEffect, useState } from 'react';

declare global {
    interface Window {
        __wxjs_environment?: string;
        WeixinJSBridge?: {
            invoke: (method: string, options: any, callback?: (res: any) => void) => void;
            ready?: (callback: () => void) => void;
        };
        wx?: {
            miniProgram?: {
                getEnv: (callback: (res: { miniprogram: boolean }) => void) => void;
                navigateBack: (options?: { delta?: number }) => void;
            };
        };
    }
}

/**
 * Hook to detect if the current page is running in WeChat Mini Program environment
 * and provide utilities to interact with the mini program
 */
export const useWeChatMiniProgram = () => {
    const [isMiniProgram, setIsMiniProgram] = useState(false);
    const [isReady, setIsReady] = useState(false);

    useEffect(() => {
        const checkEnvironment = () => {
            // Method 1: Check window.__wxjs_environment
            if (window.__wxjs_environment === 'miniprogram') {
                setIsMiniProgram(true);
                setIsReady(true);
                return;
            }

            // Method 2: Use wx.miniProgram.getEnv
            if (window.wx?.miniProgram) {
                window.wx.miniProgram.getEnv((res) => {
                    setIsMiniProgram(res.miniprogram);
                    setIsReady(true);
                });
            } else {
                setIsReady(true);
            }
        };

        // Wait for WeixinJSBridge to be ready
        if (!window.WeixinJSBridge || !window.WeixinJSBridge.invoke) {
            const readyHandler = () => {
                checkEnvironment();
                document.removeEventListener('WeixinJSBridgeReady', readyHandler);
            };
            document.addEventListener('WeixinJSBridgeReady', readyHandler, false);
        } else {
            checkEnvironment();
        }
    }, []);

    const navigateBack = (delta: number = 1) => {
        if (isMiniProgram && window.wx?.miniProgram) {
            window.wx.miniProgram.navigateBack({ delta });
        }
    };

    return {
        isMiniProgram,
        isReady,
        navigateBack,
    };
};

