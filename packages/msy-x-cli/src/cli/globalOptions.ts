import { CliError } from './errors';
import type { AuthHeader, GlobalOptions, OutputFormat } from '../types';

/**
 * 全局选项解析（设计稿 §6.1）：commander 归一化后的选项 → GlobalOptions。
 *
 * - 纯函数：不读 process.env（env 由调用方注入）、不写 stdout/stderr；
 * - `--json` / `--table` / `--csv` 互斥，同时给多个 → USAGE；
 * - `--csv` 仅数据类命令可用（query / query flat / charts run / dashboards run）；
 * - `--timeout` 默认 env `MSY_X_TIMEOUT_MS` 或 60000，上限 600000（§10.2）。
 */

export const DEFAULT_TIMEOUT_MS = 60_000;
export const MAX_TIMEOUT_MS = 600_000;

/** 供 commander 挂载用的全局 flag 清单（commands/index.ts 单一来源引用） */
export type GlobalFlagSpec = {
    flags: string;
    description: string;
};

export const GLOBAL_FLAG_SPECS: GlobalFlagSpec[] = [
    { flags: '--site <name|url>', description: '站点名或 MCP URL（默认 currentSite）' },
    { flags: '--project <uuid>', description: 'projectUuid（服务端按四级兜底链解析）' },
    { flags: '--json', description: 'JSON 输出（非 TTY 默认）' },
    { flags: '--table', description: 'ASCII 表格输出（TTY 默认）' },
    { flags: '--csv', description: 'CSV 输出（仅数据类命令）' },
    { flags: '--envelope', description: 'JSON 外包一层 {ok,tool,data,meta}' },
    { flags: '--out <path>', description: '结果写文件（0600），stdout 只回摘要' },
    { flags: '--timeout <ms>', description: '单次工具调用超时（默认 60000，上限 600000）' },
    { flags: '--mcp-url <url>', description: '直接指定 MCP URL（v1 逃生口同此）' },
    {
        flags: '--auth-header <authorization|x-api-key>',
        description: 'PAT 出站头（默认 authorization；x-api-key 仅供 v1 逃生口）',
    },
    { flags: '--config <path>', description: '配置文件路径（默认 ~/.config/msy-x/config.yaml）' },
    { flags: '--dry-run', description: '只打印将要发送的 {tool,args}，不发请求' },
    { flags: '--raw', description: '解析失败时把原始响应打到 stderr' },
    { flags: '--verbose', description: '输出更多细节（凭证已脱敏）' },
    { flags: '--quiet', description: '静默模式：stderr 不输出 rows 等提示' },
];

/** commander 归一化后的选项视图（命令自身选项之外的全局键） */
export type GlobalOptionValues = {
    site?: unknown;
    project?: unknown;
    json?: unknown;
    table?: unknown;
    csv?: unknown;
    envelope?: unknown;
    out?: unknown;
    timeout?: unknown;
    mcpUrl?: unknown;
    authHeader?: unknown;
    config?: unknown;
    dryRun?: unknown;
    raw?: unknown;
    verbose?: unknown;
    quiet?: unknown;
};

export type ParseGlobalOptionsInput = {
    /** commander 归一化后的选项对象（Command#opts()） */
    opts: GlobalOptionValues;
    /** 目标命令是否数据类命令（决定 --csv 门控） */
    dataCommand: boolean;
    /** 环境变量视图，默认 process.env（注入便于单测） */
    env?: Record<string, string | undefined>;
};

/** 字符串归一化：undefined / 空白 → null，其余 trim */
const readString = (value: unknown): string | null => {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed === '' ? null : trimmed;
};

const readFlag = (value: unknown): boolean => value === true;

/** 超时解析：显式 --timeout 非法 → USAGE；env 非法 → CONFIG；超过上限截断到上限 */
const resolveTimeoutMs = (
    rawTimeout: unknown,
    env: Record<string, string | undefined>,
): number => {
    const parse = (value: string, source: '--timeout' | 'MSY_X_TIMEOUT_MS'): number => {
        const parsed = Number(value);
        if (!Number.isInteger(parsed) || parsed < 1) {
            const code = source === '--timeout' ? 'USAGE' : 'CONFIG';
            throw new CliError({
                code,
                message: `${source} 非法：${value}（需正整数毫秒）`,
                hint: '例如 --timeout 120000（上限 600000）',
            });
        }
        return parsed;
    };

    let timeoutMs: number;
    const explicit = readString(rawTimeout);
    if (explicit !== null) {
        timeoutMs = parse(explicit, '--timeout');
    } else {
        const fromEnv = env.MSY_X_TIMEOUT_MS?.trim();
        timeoutMs =
            fromEnv !== undefined && fromEnv !== ''
                ? parse(fromEnv, 'MSY_X_TIMEOUT_MS')
                : DEFAULT_TIMEOUT_MS;
    }
    return Math.min(timeoutMs, MAX_TIMEOUT_MS);
};

const resolveAuthHeader = (value: unknown): AuthHeader | null => {
    const raw = readString(value);
    if (raw === null) return null;
    if (raw !== 'authorization' && raw !== 'x-api-key') {
        throw new CliError({
            code: 'USAGE',
            message: `--auth-header 非法：${raw}`,
            hint: '可选值：authorization | x-api-key',
        });
    }
    return raw;
};

const resolveFormat = (
    opts: GlobalOptionValues,
    dataCommand: boolean,
): OutputFormat | null => {
    const chosen: OutputFormat[] = [];
    if (readFlag(opts.json)) chosen.push('json');
    if (readFlag(opts.table)) chosen.push('table');
    if (readFlag(opts.csv)) chosen.push('csv');
    if (chosen.length > 1) {
        throw new CliError({
            code: 'USAGE',
            message: '--json / --table / --csv 互斥，只能选一个',
            hint: '缺省时按 TTY 自动判定（TTY=table，非 TTY=json）',
        });
    }
    if (chosen.length === 1 && chosen[0] === 'csv' && !dataCommand) {
        throw new CliError({
            code: 'USAGE',
            message: '--csv 仅对数据类命令可用（query / query flat / charts run / dashboards run）',
            hint: '其余命令用 --json 或 --table',
        });
    }
    return chosen.length === 1 ? chosen[0] : null;
};

export const parseGlobalOptions = ({
    opts,
    dataCommand,
    env = process.env,
}: ParseGlobalOptionsInput): GlobalOptions => ({
    site: readString(opts.site),
    projectUuid: readString(opts.project),
    format: resolveFormat(opts, dataCommand),
    envelope: readFlag(opts.envelope),
    out: readString(opts.out),
    timeoutMs: resolveTimeoutMs(opts.timeout, env),
    mcpUrl: readString(opts.mcpUrl),
    authHeader: resolveAuthHeader(opts.authHeader),
    configPath: readString(opts.config),
    dryRun: readFlag(opts.dryRun),
    raw: readFlag(opts.raw),
    verbose: readFlag(opts.verbose),
    quiet: readFlag(opts.quiet),
});
