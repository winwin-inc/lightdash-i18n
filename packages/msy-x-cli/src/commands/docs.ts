import type { CommandBuildInput, CommandSpec, ToolCall } from '../types';

/**
 * `msy-x docs [topic] [--text]` → get_mcp_docs。
 *
 * - topic 是自由字符串（非枚举）：服务端按大小写不敏感匹配文档小节，
 *   推荐值 overview / query_workflow / content_fields / session_lifecycle / security；
 * - `--text` → format: 'text'（缺省 markdown，不传该键）；
 * - get_mcp_docs 无 projectUuid 入参，不注入。
 */
export const docsCommands: CommandSpec[] = [
    {
        name: 'docs [topic]',
        description: '查看 MCP 使用文档（可选主题过滤；--text 输出纯文本）',
        options: [
            {
                flags: '--text',
                description: '纯文本格式（服务端 format=text，缺省 markdown）',
            },
        ],
        example: 'msy-x docs query_workflow',
        dataCommand: false,
        build: (input: CommandBuildInput): ToolCall[] => {
            const args: Record<string, unknown> = {};
            const topic = input.args.topic?.trim();
            if (topic !== undefined && topic !== '') {
                args.topic = topic;
            }
            if (input.options.text === true) {
                args.format = 'text';
            }
            return [{ tool: 'get_mcp_docs', args }];
        },
    },
];
