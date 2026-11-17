import { readFile } from 'node:fs/promises';
import { CliError } from '../cli/errors';
import { readStdinIfPiped } from '../lib/stdin';
import { runToolCommand } from '../cli/run';
import type { CommandContext, CommandSpec, ToolCall } from '../types';

/**
 * `msy-x call <tool> [--args '<obj>' | --file <path|->]`：兜底通道，
 * 任意工具直接透传（新工具无需等 CLI 发版）。
 *
 * - `--args` / `--file` 二选一；都不给 → args 为 `{}`（无参工具）；
 * - `--args` 是**工具入参**（D18 改名，避免与全局 `--json` 输出格式混淆：
 *   `call x --args '{}' --json` = 传空入参 + JSON 输出）；
 * - `--file -` 仅在 stdin 非 TTY（管道）时可用，避免交互终端挂死；
 * - 参数原样透传，不改写（设计稿 §10.3）；`--dry-run` 打印 {tool,args} 后返回。
 */

const localOnlyBuild = (): never => {
    throw new CliError({
        code: 'NOT_IMPLEMENTED',
        message: 'call 是透传命令，参数需要读盘/stdin',
        hint: '集成层应调用 runCallCommand（src/commands/call.ts）',
    });
};

export const callCommands: CommandSpec[] = [
    {
        name: 'call <tool>',
        description:
            '直接调用任意 MCP 工具（--args 传工具入参；--json/--table 是全局输出格式）',
        options: [
            {
                flags: '--args <json>',
                description:
                    "工具入参 JSON 对象，例 '{\"topic\":\"overview\"}'（与全局 --json 输出格式无关）",
            },
            {
                flags: '--file <path|->',
                description: '从 JSON 文件（或 stdin，仅非 TTY）读工具入参，与 --args 互斥',
            },
        ],
        example: `msy-x call get_mcp_docs --args '{"topic":"overview"}'`,
        dataCommand: false,
        build: localOnlyBuild,
    },
];

export type RunCallInput = {
    tool: string;
    /** --args 的原样 JSON 文本 */
    argsJson?: string;
    /** --file 的路径或 '-'（stdin） */
    file?: string;
    ctx: CommandContext;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

/** 读取 --file 指定的 JSON 文本；'-' 仅非 TTY */
const readArgsFile = async (file: string): Promise<string> => {
    if (file.trim() === '-') {
        if (process.stdin.isTTY === true) {
            throw new CliError({
                code: 'USAGE',
                message: '--file - 仅在 stdin 非 TTY（管道输入）时可用',
                hint: "例如 cat args.json | msy-x call <tool> --file -，或直接用 --file args.json",
            });
        }
        const piped = await readStdinIfPiped();
        if (piped === null) {
            throw new CliError({
                code: 'USAGE',
                message: 'stdin 没有可读内容（--file -）',
                hint: '用管道传入 JSON，或改用 --file <path>',
            });
        }
        return piped;
    }
    try {
        return await readFile(file, 'utf8');
    } catch (error) {
        throw new CliError({
            code: 'USAGE',
            message: `无法读取文件：${file}`,
            cause: error,
        });
    }
};

const parseArgsJson = (
    text: string,
    flag: string,
): Record<string, unknown> => {
    let parsed: unknown;
    try {
        parsed = JSON.parse(text);
    } catch (error) {
        throw new CliError({
            code: 'USAGE',
            message: `${flag} 内容不是合法 JSON`,
            hint: "工具入参必须是 JSON 对象，例 '{\"table\":\"orders\"}'",
            cause: error,
        });
    }
    if (!isRecord(parsed)) {
        throw new CliError({
            code: 'USAGE',
            message: `${flag} 内容必须是 JSON 对象（不能是数组或标量）`,
        });
    }
    return parsed;
};

export const runCallCommand = async ({
    tool,
    argsJson,
    file,
    ctx,
}: RunCallInput): Promise<void> => {
    const name = tool.trim();
    if (name === '') {
        throw new CliError({
            code: 'USAGE',
            message: '缺少位置参数 <tool>',
            hint: '先运行 msy-x tools list 查看可用工具名',
        });
    }
    if (argsJson !== undefined && file !== undefined) {
        throw new CliError({
            code: 'USAGE',
            message: '--args 与 --file 互斥，只能选一个',
        });
    }

    let args: Record<string, unknown> = {};
    if (argsJson !== undefined) {
        args = parseArgsJson(argsJson, '--args');
    } else if (file !== undefined) {
        args = parseArgsJson(await readArgsFile(file), `--file ${file}`);
    }

    const call: ToolCall = { tool: name, args };
    await runToolCommand(call, ctx);
};
