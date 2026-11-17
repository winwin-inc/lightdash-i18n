import { CliError } from '../cli/errors';
import { ExitCode, ExitCodeValue } from '../cli/exitCodes';
import { readConfig, writeConfig } from '../config/store';
import { debugLog } from '../lib/logger';
import type { AuthCredentials, CommandSpec, SiteConfig } from '../types';
import { isLoggedInOffline } from './auth';

/**
 * `site list|show|use`（本地命令，不走 ToolCall 通道，集成层调 runSiteCommand）：
 *
 * - list：全部站点 + 是否当前 + 离线登录态；
 * - show：当前（或指定）站点配置；
 * - use <name|url>：写 `currentSite`；名字或 URL 未命中已配置站点时报
 *   CONFIG 并列出可用站点。
 */

export type SiteCommandName = 'list' | 'show' | 'use';

export type RunSiteArgs = {
    /** `site show [name]` / `site use <name|url>` 的位置参数 */
    name?: string;
};

export type SiteCommandResult = {
    stdout: string;
    exitCode: ExitCodeValue;
};

const jsonLine = (value: Record<string, unknown>): string =>
    `${JSON.stringify(value)}\n`;

const localOnlyBuild = (name: string) => (): never => {
    throw new CliError({
        code: 'NOT_IMPLEMENTED',
        message: `${name} 是本地命令，不走 ToolCall 通道`,
        hint: '集成层应调用 runSiteCommand（src/commands/site.ts）',
    });
};

export const siteCommands: CommandSpec[] = [
    {
        name: 'site list',
        description: '列出配置里的全部站点与当前站点',
        options: [],
        example: 'msy-x site list',
        dataCommand: false,
        build: localOnlyBuild('site list'),
    },
    {
        name: 'site show',
        description: '查看当前（或指定）站点的配置',
        options: [],
        example: 'msy-x site show',
        dataCommand: false,
        build: localOnlyBuild('site show'),
    },
    {
        name: 'site use <name>',
        description: '切换默认站点（站点名或其 MCP URL）',
        options: [],
        example: 'msy-x site use inner',
        dataCommand: false,
        build: localOnlyBuild('site use'),
    },
];

const looksLikeUrl = (value: string): boolean =>
    /^https?:\/\//i.test(value) || value.includes('/mcp');

const normalizeUrl = (value: string): string => value.trim().replace(/\/+$/, '');

const findSiteNameByUrl = (
    url: string,
    sites: Record<string, SiteConfig>,
): string | null => {
    const target = normalizeUrl(url);
    for (const [name, site] of Object.entries(sites)) {
        if (normalizeUrl(site.mcpUrl) === target) return name;
    }
    return null;
};

/** 未知名 / URL 未命中时统一报 CONFIG，并列出可用站点（与 profiles 同口径） */
const unknownSiteError = (value: string, sites: Record<string, SiteConfig>): CliError => {
    const known = Object.keys(sites).sort();
    return new CliError({
        code: 'CONFIG',
        message: `未知的站点：${value}`,
        hint:
            known.length > 0
                ? `可用站点：${known.join(', ')}`
                : '配置里没有任何站点',
    });
};

/** 离线登录态：与 auth status 同口径（isLoggedInOffline） */
const isSiteLoggedIn = (credentials: AuthCredentials | undefined): boolean =>
    isLoggedInOffline(credentials ?? null);

export const runSiteCommand = async (
    name: SiteCommandName,
    args: RunSiteArgs,
): Promise<SiteCommandResult> => {
    const config = await readConfig();

    if (name === 'list') {
        return {
            stdout: jsonLine({
                currentSite: config.currentSite,
                sites: Object.entries(config.sites)
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([siteName, site]) => ({
                        name: siteName,
                        mcpUrl: site.mcpUrl,
                        authMode: site.authMode,
                        authHeader: site.authHeader,
                        current: siteName === config.currentSite,
                        loggedIn: isSiteLoggedIn(config.auth[siteName]),
                    })),
            }),
            exitCode: ExitCode.OK,
        };
    }

    if (name === 'show') {
        const target = args.name?.trim() || config.currentSite;
        const site = config.sites[target];
        if (site === undefined) throw unknownSiteError(target, config.sites);
        return {
            stdout: jsonLine({
                name: target,
                mcpUrl: site.mcpUrl,
                authMode: site.authMode,
                authHeader: site.authHeader,
                current: target === config.currentSite,
                loggedIn: isSiteLoggedIn(config.auth[target]),
            }),
            exitCode: ExitCode.OK,
        };
    }

    // site use <name|url>
    const target = args.name?.trim() ?? '';
    if (target === '') {
        throw new CliError({
            code: 'USAGE',
            message: 'site use 需要一个站点名或 URL 参数',
            hint: '例如：msy-x site use inner',
        });
    }
    let siteName: string | null = null;
    if (looksLikeUrl(target)) {
        siteName = findSiteNameByUrl(target, config.sites);
    } else if (config.sites[target] !== undefined) {
        siteName = target;
    }
    if (siteName === null) throw unknownSiteError(target, config.sites);

    const next = { ...config, currentSite: siteName };
    await writeConfig(next);
    debugLog(`currentSite 已切换为 ${siteName}`);
    return {
        stdout: jsonLine({
            currentSite: siteName,
            mcpUrl: config.sites[siteName]!.mcpUrl,
        }),
        exitCode: ExitCode.OK,
    };
};
