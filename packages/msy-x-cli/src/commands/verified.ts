/* eslint-disable no-await-in-loop, no-continue -- 顺序执行与 401 刷新重试的串行语义与 cli/run.ts 相同（硬性要求）；
   非目标文本块跳过用 continue 最直白 */
import { CliError } from '../cli/errors';
import { writeResult } from '../cli/output';
import { ensureFreshCredentials } from '../auth/refresh';
import { readConfig } from '../config/store';
import { executeToolCall } from '../mcp/callTool';
import { createMcpClient } from '../mcp/client';
import type {
    CommandBuildInput,
    CommandContext,
    CommandSpec,
    McpClient,
    ToolCall,
    ToolResult,
} from '../types';

/**
 * `msy-x verified`（设计稿 §6.2）：列出项目里已认证（内容验证）的图表与看板。
 *
 * - 映射 `list_verified_content`，参数与 `spaces list` 同构：
 *   `{ projectUuid?, page?, pageSize?, full? }`，pageSize 合法域 1..100；
 * - 内容验证是站点可选功能：未部署的站点返回
 *   `{ error, supported: false, hint }`（见 backend contentListTools）。
 *   此时**按成功退 0**：stdout 原样输出该 JSON，stderr 提示替代命令
 *   （设计稿 §6.2「响应 supported:false 时按成功退 0」）；
 * - 判定是纯函数 `findUnsupportedContentNotice`（不发请求，不发请求的
 *   约束同样适用于 spec.build）；请求执行由集成层调 `runVerifiedCommand`。
 */

const MAX_PAGE_SIZE = 100;

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const parsePositiveInt = (
    raw: string | boolean | undefined,
    flag: string,
): number | null => {
    if (raw === undefined || raw === false) {
        return null;
    }
    const value = Number(raw);
    if (!Number.isInteger(value) || value < 1) {
        throw new CliError({
            code: 'USAGE',
            message: `选项 ${flag} 需要不小于 1 的整数，收到：${String(raw)}`,
        });
    }
    return value;
};

/** pageSize 合法域 1..100：低于 1 报 USAGE，超过 100 本地截断到 100 */
const parsePageSize = (raw: string | boolean | undefined): number | null => {
    const value = parsePositiveInt(raw, '--page-size');
    if (value === null) {
        return null;
    }
    return Math.min(value, MAX_PAGE_SIZE);
};

export const verifiedCommands: CommandSpec[] = [
    {
        name: 'verified',
        description: '列出项目里已认证（内容验证）的图表与看板',
        options: [
            {
                flags: '--page <n>',
                description: '页码，从 1 开始',
            },
            {
                flags: '--page-size <n>',
                description: '每页条数（1..100，超过 100 截断到 100）',
            },
            {
                flags: '--full',
                description: '返回完整内容摘要而非紧凑格式',
            },
        ],
        // verified 无表名/关键词参数（返回的是已认证内容清单），示例只带真实可跑的分页 flag
        example: 'msy-x verified --page 1 --page-size 50',
        dataCommand: false,
        build: (input: CommandBuildInput): ToolCall[] => {
            const args: Record<string, unknown> = {};
            const page = parsePositiveInt(input.options.page, '--page');
            if (page !== null) {
                args.page = page;
            }
            const pageSize = parsePageSize(input.options.pageSize);
            if (pageSize !== null) {
                args.pageSize = pageSize;
            }
            if (input.options.full === true) {
                args.full = true;
            }
            if (input.projectUuid !== null) {
                args.projectUuid = input.projectUuid;
            }
            return [{ tool: 'list_verified_content', args }];
        },
    },
];

/* ------------------------------------------------------------------ */
/* supported:false 判定（纯函数）                                        */
/* ------------------------------------------------------------------ */

export type UnsupportedContentNotice = {
    /** 服务端返回的完整 payload（含 error / supported:false / hint） */
    payload: Record<string, unknown>;
    /** 要原样写到 stdout 的 JSON 文本（服务端原文） */
    rawText: string;
};

const readUnsupportedPayload = (
    record: Record<string, unknown>,
): Record<string, unknown> | null => {
    if (record.supported !== false) {
        return null;
    }
    // 服务端契约同时携带 error 与 hint（backend contentListTools）；
    // 两者至少其一存在才认定，避免误伤恰好带 supported 键的行数据
    const hasError = typeof record.error === 'string';
    const hasHint = typeof record.hint === 'string';
    return hasError || hasHint ? record : null;
};

/**
 * 从工具返回里找 `supported: false` 的部署不支持提示：
 * 先看 structuredContent，再逐个解析 content 文本块（v2 多数工具只有文本块）。
 * 找不到返回 null（正常结果，走常规渲染）。
 */
export const findUnsupportedContentNotice = (
    result: ToolResult,
): UnsupportedContentNotice | null => {
    if (isRecord(result.structuredContent)) {
        const payload = readUnsupportedPayload(result.structuredContent);
        if (payload !== null) {
            return {
                payload,
                rawText: JSON.stringify(payload, null, 2),
            };
        }
    }
    for (const block of result.content) {
        if (typeof block.text !== 'string') continue;
        try {
            const parsed: unknown = JSON.parse(block.text);
            if (!isRecord(parsed)) continue;
            const payload = readUnsupportedPayload(parsed);
            if (payload !== null) {
                return { payload, rawText: block.text };
            }
        } catch {
            // 非 JSON 文本块，跳过
        }
    }
    return null;
};

export const VERIFIED_UNSUPPORTED_NOTICE =
    '提示：当前部署未启用内容验证，可改用 msy-x charts find / dashboards find';

/* ------------------------------------------------------------------ */
/* 执行（集成层入口；401 刷新重试语义与 cli/run.ts 一致）                 */
/* ------------------------------------------------------------------ */

export type RunVerifiedDeps = {
    /** 客户端工厂（默认 createMcpClient）；单测注入假实现 */
    createClient?: typeof createMcpClient;
};

const closeQuietly = (client: McpClient): Promise<void> =>
    client.close().catch(() => undefined);

export const runVerifiedCommand = async (
    calls: ToolCall[],
    ctx: CommandContext,
    deps: RunVerifiedDeps = {},
): Promise<void> => {
    if (ctx.options.dryRun) {
        for (const call of calls) {
            process.stdout.write(
                `${JSON.stringify({ tool: call.tool, args: call.args })}\n`,
            );
        }
        return;
    }

    const { timeoutMs } = ctx.options;
    let { credentials } = ctx;

    const refreshOnAuthError = async (error: unknown): Promise<boolean> => {
        if (
            !(error instanceof CliError) ||
            error.code !== 'AUTH_REQUIRED' ||
            credentials === null
        ) {
            return false;
        }
        const config = await readConfig();
        credentials = await ensureFreshCredentials({ site: ctx.site, credentials, config });
        return true;
    };

    const openClient = () =>
        (deps.createClient ?? createMcpClient)({
            site: ctx.site,
            credentials,
            timeoutMs,
        });

    let client: McpClient;
    try {
        client = await openClient();
    } catch (error) {
        if (!(await refreshOnAuthError(error))) throw error;
        client = await openClient();
    }

    try {
        for (const call of calls) {
            let result: ToolResult;
            try {
                result = await executeToolCall({ client, call, timeoutMs });
            } catch (error) {
                if (!(await refreshOnAuthError(error))) throw error;
                await closeQuietly(client);
                client = await openClient();
                result = await executeToolCall({ client, call, timeoutMs });
            }
            const notice = findUnsupportedContentNotice(result);
            if (notice !== null) {
                // 部署未启用内容验证：按成功退 0（不抛错），
                // stdout 原样输出服务端 JSON，替代命令提示走 stderr
                process.stdout.write(`${notice.rawText}\n`);
                process.stderr.write(`${VERIFIED_UNSUPPORTED_NOTICE}\n`);
                continue;
            }
            await writeResult({
                tool: call.tool,
                result,
                ctx: { ...ctx, credentials },
            });
        }
    } finally {
        await closeQuietly(client);
    }
};
