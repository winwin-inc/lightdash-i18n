import { lightdashApi } from '../api';

export type LogLevel = 'info' | 'warn' | 'error';

export type LogData = {
    level: LogLevel;
    message: string;
    data?: unknown;
    timestamp?: string;
    context?: {
        userAgent?: string;
        url?: string;
    };
};

/**
 * 立即发送日志到后端
 * 所有日志都立即发送，确保执行顺序清晰
 */
const sendLogImmediately = async (logData: LogData): Promise<void> => {
    try {
        await lightdashApi<{ status: 'ok' }>({
            url: '/logs',
            method: 'POST',
            body: JSON.stringify(logData),
        });
    } catch (error) {
        // 静默失败，避免影响主流程
        // 只在开发环境打印错误
        if (import.meta.env.DEV) {
            console.warn('[RemoteLogger] Failed to send log:', error);
        }
    }
};

/**
 * 发送日志到后端
 * 所有日志都立即发送，确保执行顺序清晰
 * @param level - 日志级别
 * @param message - 日志消息
 * @param data - 可选的附加数据
 */
export const sendLogToBackend = (
    level: LogLevel,
    message: string,
    data?: unknown,
): void => {
    const logData: LogData = {
        level,
        message,
        data,
        timestamp: new Date().toISOString(),
        context: {
            userAgent: navigator.userAgent,
            url: window.location.href,
        },
    };

    sendLogImmediately(logData).catch(() => {
        // 静默失败，避免影响主流程
    });
};
