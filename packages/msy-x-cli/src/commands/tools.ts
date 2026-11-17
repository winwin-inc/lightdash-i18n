import { CliError } from '../cli/errors';
import { createMcpClient } from '../mcp/client';
import { getToolCatalog } from '../mcp/toolCatalog';
import { renderTable } from '../render/table';
import type { CommandContext, CommandSpec, ToolDescriptor } from '../types';

/**
 * `msy-x tools`（设计稿 §6.2）：建连后走 tools/list（getToolCatalog），
 * 不发 tools/call —— 新工具无需 CLI 发版即可见。
 *
 * - `tools list [--verbose]`：名称 + 描述（--verbose 附 inputSchema）；
 * - `tools describe <name>`：单个工具的名称/描述/输入 schema；
 * - 本地展示命令（无 ToolCall 通道），集成层调 runToolsCommand；
 * - `--dry-run`：打印 `{"tool":"tools/list","args":{}}`，不建连。
 */

const localOnlyBuild = (name: string) => (): never => {
    throw new CliError({
        code: 'NOT_IMPLEMENTED',
        message: `${name} 是本地展示命令，不走 ToolCall 通道`,
        hint: '集成层应调用 runToolsCommand（src/commands/tools.ts）',
    });
};

export const toolsCommands: CommandSpec[] = [
    {
        name: 'tools list',
        description: '列出服务端可用的 MCP 工具（tools/list）',
        options: [
            {
                flags: '--verbose',
                description: '附带每个工具的输入 schema',
            },
        ],
        example: 'msy-x tools list',
        dataCommand: false,
        build: localOnlyBuild('tools list'),
    },
    {
        name: 'tools describe <name>',
        description: '查看单个 MCP 工具的说明与输入 schema',
        options: [],
        example: 'msy-x tools describe run_semantic_metric_query',
        dataCommand: false,
        build: localOnlyBuild('tools describe'),
    },
];

export type RunToolsInput = {
    sub: 'list' | 'describe';
    /** tools describe 的位置参数 */
    name?: string;
    verbose: boolean;
    ctx: CommandContext;
};

const writeRows = (
    rows: Array<Record<string, unknown>>,
    ctx: CommandContext,
): void => {
    if (ctx.format === 'table') {
        process.stdout.write(`${renderTable(rows)}\n`);
    } else {
        process.stdout.write(`${JSON.stringify(rows, null, 2)}\n`);
    }
    if (!ctx.options.quiet) {
        process.stderr.write(`rows: ${rows.length}\n`);
    }
};

export const runToolsCommand = async ({
    sub,
    name,
    verbose,
    ctx,
}: RunToolsInput): Promise<void> => {
    if (ctx.options.dryRun) {
        process.stdout.write(
            `${JSON.stringify({
                tool: 'tools/list',
                args: sub === 'describe' ? { name: name ?? null } : {},
            })}\n`,
        );
        return;
    }

    const client = await createMcpClient({
        site: ctx.site,
        credentials: ctx.credentials,
        timeoutMs: ctx.options.timeoutMs,
    });
    let catalog: ToolDescriptor[];
    try {
        catalog = await getToolCatalog(client);
    } finally {
        await client.close().catch(() => undefined);
    }

    if (sub === 'list') {
        writeRows(
            catalog.map((tool) => ({
                name: tool.name,
                description: tool.description ?? '',
                ...(verbose ? { inputSchema: JSON.stringify(tool.inputSchema) } : {}),
            })),
            ctx,
        );
        return;
    }

    const target = catalog.find((tool) => tool.name === name);
    if (target === undefined) {
        throw new CliError({
            code: 'USAGE',
            message: `未知工具：${name ?? '(空)'}（以服务端 tools/list 为准）`,
            hint: '先运行 msy-x tools list 查看可用工具',
        });
    }
    process.stdout.write(
        `${JSON.stringify(
            {
                name: target.name,
                description: target.description,
                inputSchema: target.inputSchema,
            },
            null,
            2,
        )}\n`,
    );
    if (!ctx.options.quiet) {
        process.stderr.write('rows: 1\n');
    }
};
