import type { AuthCredentials, CliConfig, SiteProfile } from '../types';

/**
 * PAT 凭证与出站鉴权头（设计稿 §5.2）。
 *
 * - `savePat` 是纯函数：只构造新配置对象，落盘由命令层做；
 * - `authHeadersFor` 覆盖三种头形态，是全仓唯一的头选择契约：
 *   oauth → `Authorization: Bearer`；
 *   pat + authorization → `Authorization: ApiKey`（v2 主站唯一认法）；
 *   pat + x-api-key → `x-api-key`（v1 独立包逃生口）。
 */

export type SavePatInput = {
    siteName: string;
    pat: string;
    config: CliConfig;
};

/** 把某站点凭证替换为 PAT（不修改入参，返回新对象） */
export const savePat = ({ siteName, pat, config }: SavePatInput): CliConfig => ({
    ...config,
    auth: {
        ...config.auth,
        [siteName]: { mode: 'pat', pat },
    },
});

/** 删除某站点凭证（logout / refresh 失败清理共用；幂等） */
export const clearCredentials = (
    config: CliConfig,
    siteName: string,
): CliConfig => {
    if (config.auth[siteName] === undefined) return config;
    const next: Record<string, AuthCredentials> = { ...config.auth };
    delete next[siteName];
    return { ...config, auth: next };
};

export type AuthHeadersForInput = {
    site: SiteProfile;
    credentials: AuthCredentials | null;
};

/** 三种出站鉴权头（纯函数）；无凭证返回空对象让服务端回 401 */
export const authHeadersFor = ({
    site,
    credentials,
}: AuthHeadersForInput): Record<string, string> => {
    if (credentials === null) return {};
    if (credentials.mode === 'oauth') {
        return { Authorization: `Bearer ${credentials.accessToken}` };
    }
    return site.authHeader === 'x-api-key'
        ? { 'x-api-key': credentials.pat }
        : { Authorization: `ApiKey ${credentials.pat}` };
};
