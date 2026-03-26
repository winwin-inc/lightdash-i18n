/**
 * Express 中间件：从请求 header 读取 jaeger-debug-id，写入当前 Sentry span 的 attribute
 * 与 JaegerFilterSpanProcessor 配合，仅有该 header 的请求会被导出到 Jaeger
 */
import * as Sentry from '@sentry/node';
import type { Request, Response, NextFunction } from 'express';

const JAEGER_DEBUG_ID_HEADER = 'jaeger-debug-id';

export function jaegerHeaderMiddleware(
    req: Request,
    _res: Response,
    next: NextFunction,
): void {
    const value = req.headers[JAEGER_DEBUG_ID_HEADER];
    if (value && typeof value === 'string' && value.trim()) {
        const span = Sentry.getActiveSpan();
        if (span) {
            span.setAttribute('jaeger-debug-id', value.trim());
        }
    }
    next();
}
