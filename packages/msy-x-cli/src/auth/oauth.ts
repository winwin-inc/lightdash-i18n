import { randomBytes } from 'node:crypto';
import {
    discoverAuthorizationServerMetadata,
    discoverOAuthProtectedResourceMetadata,
    exchangeAuthorization,
    registerClient,
    startAuthorization,
} from '@modelcontextprotocol/sdk/client/auth.js';
import type {
    AuthorizationServerMetadata,
    OAuthClientInformation,
    OAuthClientInformationFull,
    OAuthProtectedResourceMetadata,
    OAuthTokens,
} from '@modelcontextprotocol/sdk/shared/auth.js';
import type { FetchLike } from '@modelcontextprotocol/sdk/shared/transport.js';
import { CliError } from '../cli/errors';
import type { EnvVars } from '../config/paths';
import { openBrowser } from '../lib/openBrowser';
import { debugLog, logInfo, logWarn } from '../lib/logger';
import type { OAuthCredentials, SiteProfile } from '../types';
import {
    DEFAULT_CALLBACK_TIMEOUT_MS,
    startCallbackServer,
} from './callbackServer';
import {
    ConfigOAuthClientProvider,
    OAUTH_SCOPE,
    tokensToCredentials,
} from './oauthProvider';

/**
 * OAuth 登录全流程（设计稿 §5.1）：
 *
 * 1. 起本机回环监听（127.0.0.1 + 随机端口，单次回调）；
 * 2. RFC9728 受保护资源元数据 → 授权服务器元数据（发现失败时按
 *    Lightdash 约定 `{site}/api/v1/oauth` 兜底，SDK 缺省路径正好拼对）；
 * 3. 无可用 client 注册时 DCR（client_name=msy-x-cli、scope=mcp:read、
 *    redirect_uris=[本次回环地址]）；
 * 4. startAuthorization 生成 PKCE S256 challenge 并构造授权 URL；
 * 5. 拉系统浏览器；`noBrowser` 或拉起失败时把授权 URL 打到 stderr，
 *    继续等待同一事务（绝不提前返回）；
 * 6. 等授权码：state 不一致 / error 参数 / 超时都按失败收场；
 * 7. code + code_verifier + client_secret_post 换 token；
 * 8. 返回凭证——**任何失败路径都不落盘**，落盘由命令层成功后统一做。
 */

const MCP_PATH_SUFFIX = '/api/v1/mcp';
const OAUTH_PATH = '/api/v1/oauth';

/** mcpUrl → 站点根（去 `/api/v1/mcp` 尾；其余取 origin） */
export const siteBaseFromMcpUrl = (mcpUrl: string): string => {
    const trimmed = mcpUrl.replace(/\/+$/, '');
    if (trimmed.endsWith(MCP_PATH_SUFFIX)) {
        return trimmed.slice(0, trimmed.length - MCP_PATH_SUFFIX.length);
    }
    return new URL(mcpUrl).origin;
};

/** 授权服务器基址（Lightdash：`{site}/api/v1/oauth`；refresh/revoke 共用） */
export const authorizationServerUrlFromMcpUrl = (mcpUrl: string): string =>
    `${siteBaseFromMcpUrl(mcpUrl)}${OAUTH_PATH}`;

/** 网络类错误（fetch TypeError 等）→ NETWORK（退 6），其余授权问题 → AUTH_REQUIRED（退 3） */
const toLoginError = (error: unknown, context: string): CliError => {
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
        hint: '重新运行 msy-x auth login',
        cause: error,
    });
};

export type LoginWithOAuthInput = {
    site: SiteProfile;
    /** 等待授权回调的总超时，默认 300000ms */
    timeoutMs?: number;
    /** true 时只打印授权 URL 不拉浏览器（env MSY_X_NO_BROWSER=1 等效） */
    noBrowser?: boolean;
    /** 注入环境变量（MSY_X_CONFIG / MSY_X_NO_BROWSER）；默认 process.env */
    env?: EnvVars;
    /** 注入 fetch（单测走本地 http mock 用） */
    fetchFn?: FetchLike;
    /** 授权 URL 就绪时的钩子（测试用它模拟浏览器完成授权） */
    onAuthorizationUrl?: (authorizationUrl: URL) => void | Promise<void>;
};

export const loginWithOAuth = async ({
    site,
    timeoutMs,
    noBrowser = false,
    env = process.env,
    fetchFn,
    onAuthorizationUrl,
}: LoginWithOAuthInput): Promise<OAuthCredentials> => {
    // 1. 回调监听先起：redirectUri（含随机端口）是 DCR 的注册入参
    const state = randomBytes(32).toString('hex');
    const callback = await startCallbackServer({ expectedState: state, timeoutMs });
    const provider = new ConfigOAuthClientProvider({
        siteName: site.name,
        redirectUri: callback.redirectUri,
        state,
        env,
    });

    try {
        // 2. 发现授权服务器（RFC9728 → RFC8414），失败时按约定路径兜底
        let authorizationServerUrl = authorizationServerUrlFromMcpUrl(site.mcpUrl);
        let metadata: AuthorizationServerMetadata | undefined;
        try {
            const resourceMetadata:
                | OAuthProtectedResourceMetadata
                | undefined = await discoverOAuthProtectedResourceMetadata(
                site.mcpUrl,
                undefined,
                fetchFn,
            ).catch((error: unknown) => {
                debugLog('受保护资源元数据发现失败，走约定路径兜底', error);
                return undefined;
            });
            const discoveredUrl =
                resourceMetadata?.authorization_servers?.[0] ??
                siteBaseFromMcpUrl(site.mcpUrl);
            authorizationServerUrl = discoveredUrl;
            metadata = await discoverAuthorizationServerMetadata(discoveredUrl, {
                fetchFn,
            });
        } catch (error) {
            debugLog('授权服务器元数据发现失败，走约定路径兜底', error);
            authorizationServerUrl = authorizationServerUrlFromMcpUrl(site.mcpUrl);
        }
        if (metadata === undefined) {
            debugLog(
                '未拿到授权服务器元数据，SDK 缺省路径拼出 /register /authorize /token',
            );
        }

        // 3. client 注册：能复用就复用（redirectUri 一致），否则 DCR
        let clientInfo: OAuthClientInformation | undefined =
            await provider.clientInformation();
        if (clientInfo === undefined) {
            let registered: OAuthClientInformationFull;
            try {
                registered = await registerClient(authorizationServerUrl, {
                    metadata,
                    clientMetadata: provider.clientMetadata,
                    fetchFn,
                });
            } catch (error) {
                throw toLoginError(error, '动态注册客户端失败');
            }
            await provider.saveClientInformation(registered);
            clientInfo = registered;
        }
        const clientAuthInfo: OAuthClientInformation = clientInfo;

        // 4. PKCE S256（SDK startAuthorization 固定 S256）
        const { authorizationUrl, codeVerifier } = await startAuthorization(
            authorizationServerUrl,
            {
                metadata,
                clientInformation: clientInfo,
                redirectUrl: provider.redirectUrl,
                scope: OAUTH_SCOPE,
                state: provider.state(),
            },
        );
        await provider.saveCodeVerifier(codeVerifier);

        // 5. 打开浏览器；失败 / noBrowser → URL 打到 stderr，继续等同一事务
        const waitMs = timeoutMs ?? DEFAULT_CALLBACK_TIMEOUT_MS;
        await onAuthorizationUrl?.(authorizationUrl);
        const opened =
            !noBrowser && (await openBrowser(authorizationUrl.toString(), env));
        if (!opened) {
            logWarn(
                `请在浏览器中打开以下授权链接完成登录（${Math.round(
                    waitMs / 1000,
                )}s 内）：`,
            );
            logWarn(authorizationUrl.toString());
        } else if (process.platform === 'win32') {
            // Windows 上“已拉起”不等于“窗口真的出现”（URL 关联坏掉时系统会静默无操作），
            // 所以无论成败都把链接打出来，用户永远有一条兜底路径
            logInfo('已调用系统浏览器；若没有弹出授权页，复制下面的链接手动打开：');
            logInfo(authorizationUrl.toString());
        }

        // 6. 阻塞等授权码（state / error / 超时都在这里变成 CliError）
        const authorizationCode = await callback.waitForCode();

        // 7. 换 token：client_secret_post（client_id/secret 在请求体）
        let tokens: OAuthTokens;
        try {
            tokens = await exchangeAuthorization(authorizationServerUrl, {
                metadata,
                clientInformation: clientAuthInfo,
                authorizationCode,
                codeVerifier,
                redirectUri: provider.redirectUrl,
                addClientAuthentication: async (_headers, params) => {
                    params.set('client_id', clientAuthInfo.client_id);
                    if (clientAuthInfo.client_secret !== undefined) {
                        params.set('client_secret', clientAuthInfo.client_secret);
                    }
                },
                fetchFn,
            });
        } catch (error) {
            throw toLoginError(error, '授权码换 token 失败');
        }

        // 8. 只返回，不落盘
        return tokensToCredentials({
            tokens,
            clientId: clientAuthInfo.client_id,
            clientSecret: clientAuthInfo.client_secret ?? null,
            redirectUri: provider.redirectUrl,
            scope: OAUTH_SCOPE,
        });
    } finally {
        callback.close();
    }
};
