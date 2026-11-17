import { chmod, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { CliError } from './errors';
import { pickRows, pickText } from '../render/detect';
import { renderResult } from '../render/index';
import { buildJsonPayload, renderJson } from '../render/json';
import type { CommandContext, OutputFormat, ToolResult } from '../types';

/**
 * 结果输出（设计稿 §7）：stdout 只有数据，提示/警告走 stderr。
 *
 * - 常规：renderResult 产出内容写 stdout；非 quiet 时 stderr 一行 `rows: N`；
 * - `--out <path>`：内容写文件（目录不存在则建，0600），stdout 只输出
 *   `{"written":"/abs/path","rows":N,"bytes":M}`；表格格式落盘时写 JSON（§7.5 文件只写 JSON/CSV）；
 * - 渲染源为 xml / none（find_explores / find_fields / docs 等 XML、Markdown 文本）：
 *   - JSON 模式（含 `--out` 与 table 落盘的退化）输出 `{"text":"…"}`；
 *     `--envelope` 时包成 `{ok,tool,data:{"text":…},meta}`；
 *   - 表格模式原样输出文本，并在 stderr 提示「该工具返回非表格文本」；
 * - 渲染抛 PARSE_ERROR 且 --raw：把原始响应打到 stderr 便于排查（§7.4 第 6 级）；
 * - 多调用命令（>1 条 ToolCall，目前仅 `info`）不走本函数，见 writeMultiResult（D14）。
 */

export type WriteResultInput = {
    tool: string;
    result: ToolResult;
    ctx: CommandContext;
};

const OUT_FILE_MODE = 0o600;

const writeLine = (stream: NodeJS.WriteStream, text: string): void => {
    stream.write(text.endsWith('\n') ? text : `${text}\n`);
};

/** 渲染源是纯文本（XML / Markdown 等），没有可表格化的行 */
const isTextSource = (source: string): boolean =>
    source === 'xml' || source === 'none';

const durationMsOf = (ctx: CommandContext): number =>
    Math.max(0, Math.round(performance.now() - ctx.startedAt));

/** 与文件写入共用：建目录 + 0600 落盘（已存在文件显式收紧一次） */
const writeOutFile = async (filePath: string, content: string): Promise<void> => {
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, content, { mode: OUT_FILE_MODE });
    // writeFile 的 mode 只在新建文件时生效，已存在文件显式收紧一次
    await chmod(filePath, OUT_FILE_MODE).catch(() => undefined);
};

/**
 * 计算要落 stdout / 文件的内容。
 * - JSON（含 `--out` 与 table 落盘的退化）：直接走 renderJson（meta 带 projectUuid，D8）；
 *   xml/none 文本源的数据体覆写为 `{"text":"…"}`（D7）；
 * - table / csv（无 `--out`）：xml/none 原样输出文本（rawText=true 供 stderr 提示）；
 *   其余走 renderResult。
 */
const buildContent = (
    input: WriteResultInput,
    fileFormat: OutputFormat | null,
): { content: string; rawText: boolean } => {
    const { ctx } = input;
    const picked = pickRows(input.result);
    const textSource = isTextSource(picked.source);
    // --out 时文件只写 JSON/CSV；table 落盘退化为 JSON
    const effectiveFormat: OutputFormat =
        fileFormat === 'table' ? 'json' : fileFormat ?? ctx.format;
    if (effectiveFormat === 'json') {
        return {
            content: renderJson({
                tool: input.tool,
                result: input.result,
                envelope: ctx.options.envelope,
                site: ctx.site.name,
                durationMs: durationMsOf(ctx),
                picked,
                projectUuid: ctx.options.projectUuid,
                ...(textSource ? { payload: { text: pickText(input.result) } } : {}),
            }),
            rawText: false,
        };
    }
    if (textSource) {
        return { content: pickText(input.result), rawText: true };
    }
    const rendered = renderResult({
        tool: input.tool,
        result: input.result,
        format: effectiveFormat,
        envelope: ctx.options.envelope,
        out: null,
        quiet: ctx.options.quiet,
        startedAt: ctx.startedAt,
        site: ctx.site.name,
    });
    return { content: rendered.stdout, rawText: false };
};

export const writeResult = async ({
    tool,
    result,
    ctx,
}: WriteResultInput): Promise<void> => {
    const { options, format } = ctx;
    const picked = pickRows(result);
    const rows = picked.rows !== null ? picked.rows.length : null;

    let content: string;
    let rawText: boolean;
    try {
        const built = buildContent({ tool, result, ctx }, options.out !== null ? format : null);
        content = built.content;
        rawText = built.rawText;
    } catch (error) {
        // --raw：把原始响应打到 stderr 便于排查（§7.4）
        if (
            options.raw &&
            error instanceof CliError &&
            error.code === 'PARSE_ERROR'
        ) {
            process.stderr.write(`[raw] ${pickText(result)}\n`);
        }
        throw error;
    }

    if (options.out !== null) {
        const filePath = path.resolve(options.out);
        await writeOutFile(filePath, content);
        const bytes = Buffer.byteLength(content, 'utf8');
        process.stdout.write(
            `${JSON.stringify({ written: filePath, rows, bytes })}\n`,
        );
    } else {
        writeLine(process.stdout, content);
    }

    if (!options.quiet) {
        if (rows !== null) {
            process.stderr.write(`rows: ${rows}\n`);
        }
        if (rawText) {
            process.stderr.write(
                `提示：该工具返回非表格文本（${tool}，渲染源 ${picked.source}），已原样输出\n`,
            );
        }
    }
};

/* ------------------------------------------------------------------ */
/* 多调用命令（目前仅 info，3 个工具）—— D14                            */
/* ------------------------------------------------------------------ */

export type WriteMultiResultInput = {
    calls: Array<{ tool: string; result: ToolResult }>;
    ctx: CommandContext;
};

/**
 * 多调用命令的统一输出（D14）：
 *
 * - 无 `--out`：stdout 是**单个** JSON 对象 `{ "<工具名>": <数据体>, … }`
 *   （按调用顺序），不再串联多个 JSON 文档（`JSON.parse(stdout)` 必须可解析）；
 * - `--envelope`：外层包 `{ok,tool,data,meta}`，`data` 即合并对象，
 *   `tool` 为逗号连接的工具名，`meta` 含 site / projectUuid / durationMs；
 * - `--out`：合并对象**一次**写盘（不覆盖丢数据），stdout 只回
 *   `{"written":"<abs>","calls":N,"bytes":M}`。
 */
export const writeMultiResult = async ({
    calls,
    ctx,
}: WriteMultiResultInput): Promise<void> => {
    const merged: Record<string, unknown> = {};
    for (const { tool, result } of calls) {
        merged[tool] = buildJsonPayload(result, pickRows(result));
    }
    const payload = ctx.options.envelope
        ? {
              ok: true,
              tool: calls.map(({ tool }) => tool).join(','),
              data: merged,
              meta: {
                  site: ctx.site.name,
                  projectUuid: ctx.options.projectUuid,
                  durationMs: durationMsOf(ctx),
              },
          }
        : merged;
    const content = `${JSON.stringify(payload, null, 2)}\n`;

    if (ctx.options.out !== null) {
        const filePath = path.resolve(ctx.options.out);
        await writeOutFile(filePath, content);
        const bytes = Buffer.byteLength(content, 'utf8');
        process.stdout.write(
            `${JSON.stringify({ written: filePath, calls: calls.length, bytes })}\n`,
        );
        return;
    }
    writeLine(process.stdout, content);
};
