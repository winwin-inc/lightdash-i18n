import { useMediaQuery } from '@mantine/hooks';
import { useMemo } from 'react';

/**
 * 检测是否为移动设备的 Hook
 * 结合屏幕宽度和 User Agent 检测，确保准确性
 */
export const useIsMobileDevice = (): boolean => {
    // 使用 Mantine 的 useMediaQuery 检测屏幕宽度（响应式）
    const isMobileByWidth = useMediaQuery('(max-width: 768px)');

    // 使用 User Agent 检测（作为备用，处理桌面浏览器模拟移动设备的情况）
    const isMobileByUserAgent = useMemo(() => {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
            navigator.userAgent,
        );
    }, []);

    // 如果屏幕宽度小于 768px 或者是移动设备 User Agent，则认为是移动端
    return isMobileByWidth || isMobileByUserAgent;
};

