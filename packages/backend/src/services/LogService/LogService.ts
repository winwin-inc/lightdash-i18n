import { BaseService } from '../BaseService';

export type FrontendLogLevel = 'info' | 'warn' | 'error';

export type FrontendLogData = {
    level: FrontendLogLevel;
    message: string;
    data?: unknown;
    timestamp?: string;
    context?: {
        userAgent?: string;
        url?: string;
        userId?: string;
        organizationId?: string;
    };
};

export class LogService extends BaseService {
    /**
     * 处理前端发送的日志
     * 将前端日志转换为后端日志格式并打印
     */
    logFromFrontend(logData: FrontendLogData): void {
        const { level, message, data, timestamp, context } = logData;

        // 构建日志消息
        const logMessage = `[Frontend] ${message}`;
        const logContext: Record<string, unknown> = {
            ...(data ? { data } : {}),
            ...(context || {}),
            ...(timestamp ? { frontendTimestamp: timestamp } : {}),
        };

        // 根据日志级别打印
        switch (level) {
            case 'info':
                this.logger.info(logMessage, logContext);
                break;
            case 'warn':
                this.logger.warn(logMessage, logContext);
                break;
            case 'error':
                this.logger.error(logMessage, logContext);
                break;
            default:
                this.logger.info(logMessage, logContext);
        }
    }
}
