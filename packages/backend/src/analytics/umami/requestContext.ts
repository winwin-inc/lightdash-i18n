import {
    assertUnreachable,
    isRequestMethod,
    LightdashRequestMethodHeader,
    RequestMethod,
} from '@lightdash/common';
import { AsyncLocalStorage } from 'async_hooks';

/** 随请求存活的 Umami 上下文（client/path 必填，身份字段尽力而为） */
export type UmamiRequestContext = {
    client: string;
    path: string;
    userUuid?: string;
    userEmail?: string;
    userName?: string;
};

const umamiStorage = new AsyncLocalStorage<UmamiRequestContext>();

/** 在指定上下文内执行 fn（中间件用），上下文对 fn 内产生的异步链路可见 */
export const runWithUmamiContext = <T>(
    store: UmamiRequestContext,
    fn: () => T,
): T => umamiStorage.run(store, fn);

/** 取当前请求的 Umami 上下文；无上下文（如定时任务）返回 undefined */
export const getUmamiRequestContext = (): UmamiRequestContext | undefined =>
    umamiStorage.getStore();

/**
 * 请求来源 → Umami client 码值：
 * Lightdash-Request-Method 头（WEB_APP/CLI/CLI_CI/HEADLESS_BROWSER）优先；
 * 原始路径以 /api/v1/mcp 开头视为 mcp；其余（含无法识别的头值）回落 api。
 */
export const resolveUmamiClient = (
    headerValue: string | undefined,
    requestPath: string,
): string => {
    if (requestPath.startsWith('/api/v1/mcp')) {
        return 'mcp';
    }
    const method =
        headerValue !== undefined && isRequestMethod(headerValue)
            ? headerValue
            : undefined;
    switch (method) {
        case RequestMethod.WEB_APP:
            return 'web';
        case RequestMethod.CLI:
            return 'lightdash-cli';
        case RequestMethod.CLI_CI:
            return 'lightdash-cli-ci';
        case RequestMethod.HEADLESS_BROWSER:
            return 'headless';
        case RequestMethod.UNKNOWN:
        case RequestMethod.BACKEND:
        case undefined:
            return 'api';
        default:
            return assertUnreachable(
                method,
                `Unknown request method ${String(method)}`,
            );
    }
};
