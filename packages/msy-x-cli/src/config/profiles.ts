import { CliError } from '../cli/errors';
import type { CliConfig, GlobalOptions, SiteProfile } from '../types';
import type { EnvVars } from './paths';

export type ResolveSiteInput = {
    /** 归一化后的全局选项（只用 site / mcpUrl 两个解析键） */
    options: Pick<GlobalOptions, 'site' | 'mcpUrl'>;
    config: CliConfig;
    /** 注入的环境变量，便于测试；运行时传 process.env */
    env: EnvVars;
};

/** `--site` 值是否应按 URL 处理：http(s) 前缀，或路径里已带 /mcp */
const looksLikeUrl = (value: string): boolean =>
    /^https?:\/\//i.test(value) || value.includes('/mcp');

/** URL 归一化：去尾斜杠；缺 /mcp 时保留原样（不擅自补） */
const normalizeUrl = (value: string): string => value.trim().replace(/\/+$/, '');

/** 按 URL 构造 profile：命中已配置站点则继承 name/authMode/authHeader，否则以 URL 为 name */
const profileFromUrl = (mcpUrl: string, config: CliConfig): SiteProfile => {
    for (const [name, site] of Object.entries(config.sites)) {
        if (normalizeUrl(site.mcpUrl) === mcpUrl) {
            return {
                name,
                mcpUrl,
                authMode: site.authMode,
                authHeader: site.authHeader,
            };
        }
    }
    // 未配置过的地址：v2 默认 OAuth + Authorization（设计稿 §4.2 / §5.1）
    return { name: mcpUrl, mcpUrl, authMode: 'oauth', authHeader: 'authorization' };
};

/** 按站点名构造 profile；未知名称 → CONFIG 错误，hint 列出可用站点 */
const profileFromName = (name: string, config: CliConfig): SiteProfile => {
    const site = config.sites[name];
    if (site === undefined) {
        const known = Object.keys(config.sites).sort();
        const hint =
            known.length > 0
                ? `可用站点：${known.join(', ')}；或用 --site <url> / --mcp-url <url> 直接指定 MCP 地址`
                : '配置里没有任何站点；用 --site <url> / --mcp-url <url> 直接指定 MCP 地址';
        throw new CliError({
            code: 'CONFIG',
            message: `未知的站点名：${name}`,
            hint,
        });
    }
    return { name, ...site };
};

const firstSet = (value: string | null | undefined): string | null =>
    value !== null && value !== undefined && value.trim() !== '' ? value.trim() : null;

/**
 * 站点解析优先级（设计稿 §4.3 / dev-plan P0-2）：
 * 1. `--mcp-url`（整条 URL）
 * 2. `--site` 是 http(s) 前缀或含 /mcp → 按 URL
 * 3. `--site` 是已配置站点名
 * 4. `MSY_X_MCP_URL`（整条 URL）
 * 5. `MSY_X_SITE_URL`（自动拼 /api/v1/mcp）
 * 6. `config.currentSite`
 */
export const resolveSite = ({ options, config, env }: ResolveSiteInput): SiteProfile => {
    const mcpUrl = firstSet(options.mcpUrl);
    if (mcpUrl !== null) {
        return profileFromUrl(normalizeUrl(mcpUrl), config);
    }

    const site = firstSet(options.site);
    if (site !== null) {
        return looksLikeUrl(site)
            ? profileFromUrl(normalizeUrl(site), config)
            : profileFromName(site, config);
    }

    const envMcpUrl = firstSet(env.MSY_X_MCP_URL);
    if (envMcpUrl !== null) {
        return profileFromUrl(normalizeUrl(envMcpUrl), config);
    }

    const envSiteUrl = firstSet(env.MSY_X_SITE_URL);
    if (envSiteUrl !== null) {
        const base = normalizeUrl(envSiteUrl);
        const full = base.endsWith('/api/v1/mcp')
            ? base
            : `${base}/api/v1/mcp`;
        return profileFromUrl(full, config);
    }

    return profileFromName(config.currentSite, config);
};
