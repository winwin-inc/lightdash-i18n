import { CliError } from '../cli/errors';
import type { CommandBuildInput, CommandSpec, ToolCall } from '../types';

/**
 * `msy-x values <fieldId>`：查看字段（维度）的去重取值，用于核对过滤词。
 *
 * v2 入参：`{ table（必填）, fieldId（必填）, query?, dashboardUuid?, projectUuid? }`。
 * 无 `limit`（服务端固定 100）；缺 `--table` 直接报 USAGE。
 */
const withProject = (
    args: Record<string, unknown>,
    projectUuid: string | null,
): Record<string, unknown> => {
    if (projectUuid === null) {
        return args;
    }
    return { ...args, projectUuid };
};

const requireFieldId = (fieldId: string | undefined): string => {
    if (fieldId === undefined || fieldId === '') {
        throw new CliError({
            code: 'USAGE',
            message: '缺少位置参数 <fieldId>',
        });
    }
    return fieldId;
};

export const valuesCommands: CommandSpec[] = [
    {
        name: 'values <fieldId>',
        description: '查看某字段（维度）的去重取值，用于核对过滤词',
        options: [
            {
                flags: '--table <table>',
                description: '字段所在表（exploreName），必填',
            },
            {
                flags: '--search <s>',
                description: '过滤取值的关键词（服务端入参 query）',
            },
            {
                flags: '--dashboard <uuid>',
                description: '强制看板模式下关联的看板 UUID（dashboardUuid）',
            },
        ],
        example: 'msy-x values pinleibaohsm_cls_top_period --table pinleibaohsm_cls_top',
        dataCommand: false,
        build: (input: CommandBuildInput): ToolCall[] => {
            const { table } = input.options;
            if (typeof table !== 'string' || table === '') {
                throw new CliError({
                    code: 'USAGE',
                    message: '缺少必填选项 --table <table>',
                    hint: 'fieldId 形如 table_field，可先用 msy-x fields find 确认字段名与所属表，再用 --table 传入表名',
                });
            }
            const args: Record<string, unknown> = {
                table,
                fieldId: requireFieldId(input.args.fieldId),
            };
            const { search } = input.options;
            if (typeof search === 'string' && search !== '') {
                args.query = search;
            }
            const { dashboard } = input.options;
            if (typeof dashboard === 'string' && dashboard !== '') {
                args.dashboardUuid = dashboard;
            }
            return [
                {
                    tool: 'search_field_values',
                    args: withProject(args, input.projectUuid),
                },
            ];
        },
    },
];
