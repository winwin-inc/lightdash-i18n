import { randomBytes } from 'node:crypto';
import type { OAuthClientProvider } from '@modelcontextprotocol/sdk/client/auth.js';
import type {
    OAuthClientInformation,
    OAuthClientInformationFull,
    OAuthClientMetadata,
    OAuthTokens,
} from '@modelcontextprotocol/sdk/shared/auth.js';
import { readConfig, writeConfig } from '../config/store';
import type { EnvVars } from '../config/paths';
import type { OAuthCredentials } from '../types';
import { debugLog } from '../lib/logger';

/**
 * SDK `OAuthClientProvider` 的本仓实现（设计稿 §4.2 / §5.1）：
 *
 * - client 元数据固定：client_name `msy-x-cli`、scope `mcp:read`、
 *   redirect 用回环地址、PKCE S256（由 SDK startAuthorization 保证）、
 *   token 端点认证走 `client_secret_post`；
 * - 读取（clientInformation / tokens）优先内存，其次配置文件；
 * - `clientInformation()` 只有当已存凭证的 redirectUri 与本次回环地址
 *   （含端口）完全一致时才复用注册信息，否则返回 undefined 触发重新 DCR，
 *   避免 redirect_uri 与注册不一致被 authorize 拒掉；
 * - `saveClientInformation` 只存内存：配置文件结构要求完整凭证才能落盘
 *   （access token 等），半截 client 信息不写文件；
 * - `saveTokens` 原子写回（writeConfig：临时文件 + rename）。
 */

export const CLIENT_NAME = 'msy-x-cli';
export const OAUTH_SCOPE = 'mcp:read';
export const DEFAULT_TOKEN_TTL_S = 3600;

export type ConfigOAuthProviderOptions = {
    /** 配置文件 sites/auth 的键：站点名或 ad-hoc URL */
    siteName: string;
    /** 本事务回环回调地址（http://127.0.0.1:<port>/callback） */
    redirectUri: string;
    /** 32B hex state；登录事务生成，保证与回调监听同一事务 */
    state?: string;
    /** 注入环境变量（MSY_X_CONFIG）；默认 process.env */
    env?: EnvVars;
};

const normalizeUri = (value: string): string => value.replace(/\/+$/, '');

/** OAuthClientInformationFull → OAuthClientInformation（丢掉注册时间等附加字段） */
const clientInformationFullToInfo = (
    full: OAuthClientInformationFull,
): OAuthClientInformation =>
    full.client_secret === undefined
        ? { client_id: full.client_id }
        : { client_id: full.client_id, client_secret: full.client_secret };

export type TokensToCredentialsInput = {
    tokens: OAuthTokens;
    clientId: string;
    clientSecret: string | null;
    redirectUri: string;
    scope: string;
    now?: () => number;
};

/** SDK OAuthTokens → 本仓 OAuthCredentials（纯函数，oauth / refresh 共用） */
export const tokensToCredentials = ({
    tokens,
    clientId,
    clientSecret,
    redirectUri,
    scope,
    now = Date.now,
}: TokensToCredentialsInput): OAuthCredentials => ({
    mode: 'oauth',
    clientId,
    clientSecret,
    redirectUri,
    accessToken: tokens.access_token,
    accessExpiresAt: new Date(
        now() + (tokens.expires_in ?? DEFAULT_TOKEN_TTL_S) * 1000,
    ).toISOString(),
    refreshToken: tokens.refresh_token ?? null,
    scope: tokens.scope ?? scope,
});

/** 本仓 OAuthCredentials → SDK OAuthTokens（expires_in 按剩余秒数折算） */
export const credentialsToTokens = (credentials: OAuthCredentials): OAuthTokens => {
    const remainingMs = Date.parse(credentials.accessExpiresAt) - Date.now();
    return {
        access_token: credentials.accessToken,
        token_type: 'Bearer',
        expires_in: Math.max(0, Math.round(remainingMs / 1000)),
        ...(credentials.refreshToken === null
            ? {}
            : { refresh_token: credentials.refreshToken }),
        scope: credentials.scope,
    };
};

export class ConfigOAuthClientProvider implements OAuthClientProvider {
    private readonly siteName: string;

    private readonly redirectUriValue: string;

    private readonly envValue: EnvVars | undefined;

    private readonly initialState: string | undefined;

    private clientInfoValue: OAuthClientInformationFull | null = null;

    private tokensValue: OAuthTokens | null = null;

    private codeVerifierValue: string | null = null;

    private stateValue: string | null = null;

    constructor(options: ConfigOAuthProviderOptions) {
        this.siteName = options.siteName;
        this.redirectUriValue = options.redirectUri;
        this.envValue = options.env;
        this.initialState = options.state;
    }

    private get env(): EnvVars {
        return this.envValue ?? process.env;
    }

    get redirectUrl(): string {
        return this.redirectUriValue;
    }

    get clientMetadata(): OAuthClientMetadata {
        return {
            client_name: CLIENT_NAME,
            redirect_uris: [this.redirectUriValue],
            scope: OAUTH_SCOPE,
            grant_types: ['authorization_code', 'refresh_token'],
            // 与后端 token 端点实际支持的 client_secret_post 对齐（§2.2）
            token_endpoint_auth_method: 'client_secret_post',
        };
    }

    state(): string {
        if (this.stateValue === null) {
            this.stateValue = this.initialState ?? randomBytes(32).toString('hex');
        }
        return this.stateValue;
    }

    /** 已存凭证的 redirectUri（含端口）与本次一致时才复用 client 注册 */
    async clientInformation(): Promise<OAuthClientInformation | undefined> {
        if (this.clientInfoValue !== null) {
            return clientInformationFullToInfo(this.clientInfoValue);
        }
        const credentials = await this.readStoredCredentials();
        if (credentials === null) return undefined;
        if (
            normalizeUri(credentials.redirectUri) !==
            normalizeUri(this.redirectUriValue)
        ) {
            debugLog('已存 client 注册的 redirectUri 与本次回环地址不一致，重新 DCR');
            return undefined;
        }
        return credentials.clientSecret === null
            ? { client_id: credentials.clientId }
            : {
                  client_id: credentials.clientId,
                  client_secret: credentials.clientSecret,
              };
    }

    /** 只存内存：配置结构要求完整凭证才落盘，半截 client 信息不写文件 */
    async saveClientInformation(
        clientInformation: OAuthClientInformationFull,
    ): Promise<void> {
        this.clientInfoValue = clientInformation;
    }

    async tokens(): Promise<OAuthTokens | undefined> {
        if (this.tokensValue !== null) return this.tokensValue;
        const credentials = await this.readStoredCredentials();
        return credentials === null ? undefined : credentialsToTokens(credentials);
    }

    /** 内存 + 原子写回配置（writeConfig：同目录临时文件 → rename） */
    async saveTokens(tokens: OAuthTokens): Promise<void> {
        this.tokensValue = tokens;
        const clientInfo = await this.resolveClientInformation();
        if (clientInfo === null) {
            throw new Error('缺少 client 注册信息，无法保存 OAuth 凭证');
        }
        const config = await readConfig(this.env);
        config.auth[this.siteName] = tokensToCredentials({
            tokens,
            clientId: clientInfo.client_id,
            clientSecret: clientInfo.client_secret ?? null,
            redirectUri: this.redirectUriValue,
            scope: OAUTH_SCOPE,
        });
        await writeConfig(config, this.env);
    }

    /** 登录流程自行拉浏览器 / 打印 URL（见 oauth.ts），这里不重复动作 */
    // eslint-disable-next-line class-methods-use-this -- 接口要求实例方法，实现上无需 this
    redirectToAuthorization(authorizationUrl: URL): void {
        debugLog('redirectToAuthorization', String(authorizationUrl));
    }

    saveCodeVerifier(codeVerifier: string): void {
        this.codeVerifierValue = codeVerifier;
    }

    async codeVerifier(): Promise<string> {
        if (this.codeVerifierValue === null) {
            throw new Error('当前会话没有保存 PKCE code_verifier');
        }
        return this.codeVerifierValue;
    }

    /**
     * 强制 `client_secret_post`：client_id / client_secret 放请求体，
     * 不走 Basic 头（后端 token 端点两种都支持，本仓统一 post 便于审计）。
     */
    async addClientAuthentication(
        _headers: Headers,
        params: URLSearchParams,
    ): Promise<void> {
        const clientInfo = await this.resolveClientInformation();
        if (clientInfo === null) {
            throw new Error('缺少 client 注册信息，无法构造 token 请求');
        }
        params.set('client_id', clientInfo.client_id);
        if (clientInfo.client_secret !== undefined) {
            params.set('client_secret', clientInfo.client_secret);
        }
    }

    private async resolveClientInformation(): Promise<OAuthClientInformation | null> {
        if (this.clientInfoValue !== null) {
            return clientInformationFullToInfo(this.clientInfoValue);
        }
        return (await this.clientInformation()) ?? null;
    }

    private async readStoredCredentials(): Promise<OAuthCredentials | null> {
        try {
            const config = await readConfig(this.env);
            const credentials = config.auth[this.siteName];
            return credentials !== undefined && credentials.mode === 'oauth'
                ? credentials
                : null;
        } catch (error) {
            debugLog('读取已存 OAuth 凭证失败，按无凭证处理', error);
            return null;
        }
    }
}
