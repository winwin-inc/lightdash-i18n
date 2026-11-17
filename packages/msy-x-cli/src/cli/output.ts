import { chmod, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { CliError } from './errors';
import { pickRows, pickText } from '../render/detect';
import { renderResult } from '../render/index';
import type { CommandContext, OutputFormat, ToolResult } from '../types';

/**
 * 结果输出（设计稿 §7）：stdout 只有数据，提示/警告走 stderr。
 *
 * - 常规：renderResult 产出内容写 stdout；非 quiet 时 stderr 一行 `rows: N`；
 * - `--out <path>`：内容写文件（目录不存在则建，0600），stdout 只输出
 *   `{"written":"/abs/path","rows":N,"bytes":M}`；表格格式落盘时写 JSON（§7.5 文件只写 JSON/CSV）；
 * - 渲染源为 xml / none（find_explores / find_fields 等 XML 片段）：原样输出
 *   pickText(...)，并在 stderr 提示未做结构化渲染；
 * - 渲染抛 PARSE_ERROR 且 --raw：把原始响应打到 stderr 便于排查（§7.4 第 6 级）。
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

/** 计算要落 stdout / 文件的内容；textSource 为 xml/none 时原样输出文本 */
const buildContent = (
    input: WriteResultInput,
    fileFormat: OutputFormat | null,
): { content: string; textSource: boolean } => {
    const { ctx } = input;
    const picked = pickRows(input.result);
    const textSource = picked.source === 'xml' || picked.source === 'none';
    if (textSource) {
        return { content: pickText(input.result), textSource: true };
    }
    // --out 时文件只写 JSON/CSV；table 落盘退化为 JSON
    const effectiveFormat: OutputFormat =
        fileFormat === 'table' ? 'json' : fileFormat ?? ctx.format;
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
    return { content: rendered.stdout, textSource: false };
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
    let textSource: boolean;
    try {
        const built = buildContent({ tool, result, ctx }, options.out !== null ? format : null);
        content = built.content;
        textSource = built.textSource;
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
        await mkdir(path.dirname(filePath), { recursive: true });
        await writeFile(filePath, content, { mode: OUT_FILE_MODE });
        // writeFile 的 mode 只在新建文件时生效，已存在文件显式收紧一次
        await chmod(filePath, OUT_FILE_MODE).catch(() => undefined);
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
        if (textSource) {
            process.stderr.write(
                `提示：${tool} 返回的是文本（渲染源 ${picked.source}），已原样输出，未做表格化渲染\n`,
            );
        }
    }
};
