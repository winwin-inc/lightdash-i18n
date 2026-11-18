import type { FetchLike } from '@modelcontextprotocol/sdk/shared/transport.js';
import qrcode from 'qrcode-terminal';
import { CliError } from '../cli/errors';
import { debugLog, logWarn } from '../lib/logger';
import type { EnvVars } from '../config/paths';
import type { OAuthCredentials, SiteProfile } from '../types';
import { authorizationServerUrlFromMcpUrl } from './oauth';
import { OAUTH_SCOPE, tokensToCredentials } from './oauthProvider';

/**
 * 设备码登录（RFC 8628，无浏览器环境专用）：
 *
 * 1. POST {site}/api/v1/oauth/device 拿 device_code + user_code；
 * 2. 终端渲染 verification_uri_complete 二维码 + 明文 user_code
 *    （手机任意扫码工具都能打开，包括微信扫一扫）；
 * 3. 轮询 POST /device/token：authorization_pending 继续 etc；
 * 4. 拿到 access_token / refresh_token 后与浏览器 OAuth 同构落盘，
 *    凭证保鲜（refresh）复用现有流程。
 *
 * 任何失败路径都不落盘，落盘由命令层成功后统一做（与 loginWithOAuth 一致）。
 */

/** 设备码流程专用公开客户端（后端 oauth2_clients 预注册，scope=mcp:read） */
export const DEVICE_CLIENT_ID = 'msy-x-cli';

const DEVICE_GRANT_TYPE = 'urn:ietf:params:oauth:grant-type:device_code';

/** 后端 device_code 默认有效期（RFC 8628 / lightdash 均为 10 分钟） */
const DEFAULT_DEVICE_CODE_TTL_MS = 10 * 60 * 1000;

export type DeviceAuthorizationResponse = {
    device_code: string;
    user_code: string;
    verification_uri: string;
    verification_uri_complete: string;
    expires_in: number;
    interval: number;
};

export type LoginWithDeviceQrInput = {
    site: SiteProfile;
    /** 总超时，默认 600000ms（后端 device_code 有效期 10 分钟） */
    timeoutMs?: number;
    /** 注入环境变量；默认 process.env */
    env?: EnvVars;
    /** 注入 fetch（单测 mock 用） */
    fetchFn?: FetchLike;
    /** 二维码/提示输出；默认打到 stderr，测试可捕获 */
    print?: (line: string) => void;
    /** 轮询间隔覆盖（测试用，毫秒） */
    pollIntervalMs?: number;
};

const sleep = (ms: number): Promise<void> =>
    new Promise((resolve) => {
        setTimeout(resolve, ms);
    });

const toDeviceError = (error: unknown, context: string): CliError => {
    if (error instanceof CliError) return error;
    if (error instanceof TypeError) {
        return new CliError({
            code: 'NETWORK',
            message: `${context}：无法连接站点`,
            hint: '检查网络 / 代理 / 站点地址后重试',
            cause: error,
        });
    }
    return new CliError({
        code: 'AUTH_REQUIRED',
        message: `${context}：${error instanceof Error ? error.message : String(error)}`,
        hint: '重新运行 msy-x auth login（或 --qr）',
        cause: error,
    });
};

export const loginWithDeviceQr = async ({
    site,
    timeoutMs,
    fetchFn,
    print = (line: string): void => {
        process.stderr.write(`${line}\n`);
    },
    pollIntervalMs,
}: LoginWithDeviceQrInput): Promise<OAuthCredentials> => {
    // env 预留：与 loginWithOAuth 的 env 注入口径一致（当前设备码流程不读 env）
    // FetchLike 的入参类型比全局 fetch 窄（无 Request），包一层收窄
    const doFetch = (url: string, init?: RequestInit): Promise<Response> =>
        (fetchFn ?? globalThis.fetch)(url, init) as Promise<Response>;
    const authorizationServerUrl = authorizationServerUrlFromMcpUrl(
        site.mcpUrl,
    );

    // 1. 申请设备码
    let authorization: DeviceAuthorizationResponse;
    try {
        const response = await doFetch(
            `${authorizationServerUrl}/device`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ client_id: DEVICE_CLIENT_ID }),
            },
        );
        if (!response.ok) {
            const rawBody = await response.text();
            let bodyError: unknown;
            try {
                bodyError = (JSON.parse(rawBody) as Record<string, unknown>)
                    .error;
            } catch {
                bodyError = undefined;
            }
            if (response.status === 404) {
                throw new CliError({
                    code: 'AUTH_REQUIRED',
                    message:
                        '站点不支持扫码登录：镜像需 ≥ 2.7.5（2.7.4 的设备码会话存内存，多副本会随机失败）',
                    hint: '改用 msy-x auth login --no-browser 或 --token <pat>',
                });
            }
            if (response.status === 429 || bodyError === 'slow_down') {
                throw new CliError({
                    code: 'AUTH_REQUIRED',
                    message: '申请设备码被限流，请稍后重试',
                    hint: '稍等片刻后重新运行 msy-x auth login --qr',
                });
            }
            throw new Error(`POST /device ${response.status} ${rawBody}`);
        }
        authorization = (await response.json()) as DeviceAuthorizationResponse;
    } catch (error) {
        throw toDeviceError(error, '申请设备码失败');
    }

    // 2. 终端二维码 + 明文码
    print('');
    print(
        '请用手机扫码打开确认页（微信/相机扫一扫均可），核对页面验证码与下方一致后点「允许」：',
    );
    print('');
    print(`    ${authorization.user_code}`);
    print('');
    qrcode.generate(authorization.verification_uri_complete, { small: true });
    print('');
    print(
        `无法扫码时，在任意设备浏览器打开：${authorization.verification_uri_complete}`,
    );
    print(
        '提示：微信内打开若要求重新登录或提示未授权，请点右上角 ··· →「在浏览器打开」；PC 浏览器打开同样有效。',
    );
    print('');

    // 3. 轮询 token
    // expires_in 缺失/非法时 undefined * 1000 = NaN，deadline 立刻到期、直接报超时
    const serverExpiresIn = authorization.expires_in;
    const sessionLifetimeMs =
        Number.isFinite(serverExpiresIn) && serverExpiresIn > 0
            ? serverExpiresIn * 1000
            : DEFAULT_DEVICE_CODE_TTL_MS;
    const deadline = Date.now() + (timeoutMs ?? sessionLifetimeMs);
    // interval 缺失/非法时 undefined * 1000 = NaN，?? 不兜 NaN，sleep(NaN) 变 0ms 热轮询
    const serverInterval = authorization.interval;
    let intervalMs =
        pollIntervalMs ??
        (Number.isFinite(serverInterval) && serverInterval > 0
            ? serverInterval * 1000
            : 5_000);
    /**
     * 轮询内三类分流（deadline 兜底，不新增无限重试）：
     * - 继续等：authorization_pending / slow_down（+5s）；
     * - 可重试：HTTP 5xx、JSON 解析失败、网络 TypeError → sleep(interval) 后
     *   continue，记录 lastRetryableError（网络类 / 服务端类）；
     * - 终态：expired_token / access_denied / invalid_grant、非 2xx 且
     *   error 不在上述集合的 4xx。
     */
    let lastRetryableError: {
        kind: 'network' | 'server';
        message: string;
    } | null = null;
    for (;;) {
        if (Date.now() >= deadline) {
            if (lastRetryableError?.kind === 'network') {
                throw new CliError({
                    code: 'NETWORK',
                    message: `设备码登录超时：${lastRetryableError.message}`,
                    hint: '检查网络 / 代理 / 站点地址后重试 msy-x auth login --qr',
                });
            }
            if (lastRetryableError) {
                throw new CliError({
                    code: 'AUTH_REQUIRED',
                    message: `设备码登录超时：服务端暂时不可用（${lastRetryableError.message}）`,
                    hint: '稍后重试 msy-x auth login --qr',
                });
            }
            throw new CliError({
                code: 'AUTH_REQUIRED',
                message: '设备码登录超时（未在有效期内确认）',
                hint: '重新运行 msy-x auth login --qr',
            });
        }

        let body: Record<string, unknown> | null = null;
        // 本轮的可重试失败（5xx / 解析失败 / 网络 TypeError），null 表示本轮无
        let retryable: { kind: 'network' | 'server'; message: string } | null =
            null;
        try {
            const response = await doFetch(
                `${authorizationServerUrl}/device/token`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                    },
                    body: new URLSearchParams({
                        grant_type: DEVICE_GRANT_TYPE,
                        device_code: authorization.device_code,
                        client_id: DEVICE_CLIENT_ID,
                    }).toString(),
                },
            );
            // 注意：undici 的 response.json() 解析失败抛的是 TypeError，
            // 必须在此先行捕获并归类为「服务端类」，否则会被外层
            // TypeError 分支误判成网络问题。
            try {
                body = (await response.json()) as Record<string, unknown>;
            } catch {
                retryable = {
                    kind: 'server',
                    message: `POST /device/token 返回非 JSON 响应（HTTP ${response.status}）`,
                };
            }
            if (!retryable && !response.ok) {
                const errorCode = body?.error;
                if (errorCode === 'authorization_pending') {
                    debugLog('device token: authorization_pending');
                } else if (errorCode === 'slow_down') {
                    intervalMs += 5_000;
                    logWarn('服务端限流，放慢轮询…');
                } else if (errorCode === 'expired_token') {
                    throw new CliError({
                        code: 'AUTH_REQUIRED',
                        message: '设备码已过期',
                        hint: '重新运行 msy-x auth login --qr',
                    });
                } else if (errorCode === 'access_denied') {
                    throw new CliError({
                        code: 'AUTH_REQUIRED',
                        message: '用户在确认页拒绝了本次登录',
                        hint: '重新运行 msy-x auth login --qr',
                    });
                } else if (errorCode === 'invalid_grant') {
                    throw new CliError({
                        code: 'AUTH_REQUIRED',
                        message: '设备码无效或已过期（服务端未找到该会话）',
                        hint: '重新运行 msy-x auth login --qr',
                    });
                } else if (response.status >= 500) {
                    // 5xx 视为服务端暂时不可用，可重试而非终态
                    retryable = {
                        kind: 'server',
                        message: `POST /device/token ${response.status} ${JSON.stringify(body)}`,
                    };
                } else {
                    throw new Error(
                        `POST /device/token ${response.status} ${JSON.stringify(body)}`,
                    );
                }
            }
        } catch (error) {
            if (error instanceof CliError) {
                // 终态错误（expired_token / access_denied / invalid_grant /
                // 未知 4xx → toDeviceError 包装后的 AUTH_REQUIRED）
                throw error;
            }
            if (error instanceof TypeError) {
                // fetch 网络层失败（连接拒绝 / DNS / TLS 等），可重试
                retryable = {
                    kind: 'network',
                    message: `POST /device/token 网络请求失败：${error.message}`,
                };
            } else if (!retryable) {
                throw toDeviceError(error, '设备码换 token 失败');
            }
        }

        if (retryable) {
            lastRetryableError = retryable;
            debugLog(
                `device token: 可重试错误（${retryable.kind}），${intervalMs}ms 后重试：${retryable.message}`,
            );
            await sleep(intervalMs);
            continue;
        }

        if (body && typeof body.access_token === 'string') {
            // 4. 与浏览器 OAuth 同构的凭证（公开客户端无 secret；无回调地址）
            return tokensToCredentials({
                tokens: {
                    access_token: body.access_token,
                    token_type: 'Bearer',
                    expires_in:
                        typeof body.expires_in === 'number'
                            ? body.expires_in
                            : undefined,
                    refresh_token:
                        typeof body.refresh_token === 'string'
                            ? body.refresh_token
                            : undefined,
                    scope: typeof body.scope === 'string' ? body.scope : undefined,
                },
                clientId: DEVICE_CLIENT_ID,
                clientSecret: null,
                redirectUri: '',
                scope: OAUTH_SCOPE,
            });
        }

        await sleep(intervalMs);
    }
};
