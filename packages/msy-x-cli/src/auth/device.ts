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
            throw new Error(
                `POST /device ${response.status} ${await response.text()}`,
            );
        }
        authorization = (await response.json()) as DeviceAuthorizationResponse;
    } catch (error) {
        throw toDeviceError(error, '申请设备码失败');
    }

    // 2. 终端二维码 + 明文码
    print('');
    print('请使用手机扫码（微信/相机扫一扫均可）完成登录，并核对下方代码：');
    print('');
    print(`    ${authorization.user_code}`);
    print('');
    qrcode.generate(authorization.verification_uri_complete, { small: true });
    print('');
    print(
        `无法扫码时，在任意设备浏览器打开：${authorization.verification_uri_complete}`,
    );
    print('');

    // 3. 轮询 token
    const deadline = Date.now() + (timeoutMs ?? authorization.expires_in * 1000);
    let intervalMs =
        pollIntervalMs ?? authorization.interval * 1000 ?? 5_000;
    for (;;) {
        if (Date.now() >= deadline) {
            throw new CliError({
                code: 'AUTH_REQUIRED',
                message: '设备码登录超时（未在有效期内确认）',
                hint: '重新运行 msy-x auth login --qr',
            });
        }
        let body: Record<string, unknown>;
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
            body = (await response.json()) as Record<string, unknown>;
            if (!response.ok) {
                const errorCode = body.error;
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
                } else {
                    throw new Error(
                        `POST /device/token ${response.status} ${JSON.stringify(body)}`,
                    );
                }
            }
        } catch (error) {
            throw toDeviceError(error, '设备码换 token 失败');
        }

        if (typeof body.access_token === 'string') {
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
