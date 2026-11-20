import { CliError } from '../cli/errors';
import type {
    CommandBuildInput,
    CommandSpec,
    ToolCall,
} from '../types';

/**
 * `msy-x query`（设计稿 §6.2 / §6.3，v2 真实入参口径）：
 *
 * - `query -e … --dimensions … --metrics …` → `run_semantic_metric_query`
 *   `{ exploreName, metrics（必填键，缺省 []）, dimensions?, filters?, limit?, valueFormat?, dashboardUuid?, projectUuid? }`；
 * - `query --file <path|->`：读 Explorer metricQuery JSON 后**本地翻译**成扁平参数
 *   （v2 不收 metricQuery），v2 不支持的字段（sorts / tableCalculations /
 *   customDimensions 等）丢弃并产生告警（集成层负责打到 stderr）；
 * - `query flat -e …` → `run_metric_query`（实验）：`{ vizConfig: { exploreName,
 *   metrics, dimensions, sorts, limit: number|null }, filters?, dashboardUuid?, projectUuid? }`；
 *   vizConfig 过滤规则必须带 fieldType + fieldFilterType，CLI 推不出来 → 不支持 `--filter`。
 *
 * build 是纯函数：不读文件、不发请求、不写 stdout/stderr；`--file` 的文件读取
 * 由集成层（commands/index.ts）完成（见 buildQueryFileCalls）。
 */

const withProject = (
    args: Record<string, unknown>,
    projectUuid: string | null,
): Record<string, unknown> =>
    projectUuid === null ? args : { ...args, projectUuid };

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

/** option 值归一化：string 且非空 → trim 后的值，其余（undefined/false/''）→ null */
const readStringOption = (value: unknown): string | null => {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed === '' ? null : trimmed;
};

/** 逗号分隔的 fieldId 列表：`--dimensions a,b` → ['a','b'] */
const parseFieldList = (value: unknown, flag: string): string[] => {
    const raw = readStringOption(value);
    if (raw === null) return [];
    const items = raw
        .split(',')
        .map((item) => item.trim())
        .filter((item) => item !== '');
    if (items.length === 0) {
        throw new CliError({
            code: 'USAGE',
            message: `${flag} 没有有效的 fieldId`,
        });
    }
    return items;
};

/** 可重复 option（commander 收集为 string[]）归一化 */
const readRepeatable = (value: unknown): string[] => {
    if (value === undefined || value === false) return [];
    if (typeof value === 'string') return value === '' ? [] : [value];
    if (Array.isArray(value)) {
        return value.filter((item): item is string => typeof item === 'string');
    }
    return [];
};

/** `--filter fieldId=v1,v2`（可重复）→ dimensions 等值规则 */
export type SemanticFilterRule = {
    fieldId: string;
    operator: string;
    values: unknown[];
};

const parseFilterFlags = (value: unknown): SemanticFilterRule[] => {
    const rules: SemanticFilterRule[] = [];
    for (const entry of readRepeatable(value)) {
        const separator = entry.indexOf('=');
        if (separator <= 0) {
            throw new CliError({
                code: 'USAGE',
                message: `--filter 格式非法：${entry}`,
                hint: '格式 --filter <fieldId=value>，多值用逗号分隔：--filter period=2026Q1,2026Q2',
            });
        }
        const fieldId = entry.slice(0, separator).trim();
        const rawValues = entry.slice(separator + 1).trim();
        const values =
            rawValues === ''
                ? []
                : rawValues.split(',').map((item) => item.trim());
        rules.push({ fieldId, operator: 'equals', values });
    }
    return rules;
};

/** `--filters-json '<json>'` → 对象；未设置返回 null */
const parseFiltersJsonObject = (
    value: unknown,
    flag: string,
): Record<string, unknown> | null => {
    const raw = readStringOption(value);
    if (raw === null) return null;
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch (error) {
        throw new CliError({
            code: 'USAGE',
            message: `${flag} 不是合法 JSON`,
            hint: '传入完整 filters 对象，例如 \'{"dimensions":[{"fieldId":"period","operator":"equals","values":["2026Q2"]}],"metrics":[]}\'',
            cause: error,
        });
    }
    if (!isRecord(parsed)) {
        throw new CliError({
            code: 'USAGE',
            message: `${flag} 必须是 JSON 对象`,
        });
    }
    return parsed;
};
const parseLimit = (value: unknown): number | null => {
    const raw = readStringOption(value);
    if (raw === null) return null;
    const parsed = Number(raw);
    if (!Number.isInteger(parsed) || parsed < 1) {
        throw new CliError({
            code: 'USAGE',
            message: `--limit 非法：${raw}（需不小于 1 的整数）`,
        });
    }
    return parsed;
};

const parseValueFormat = (value: unknown): 'raw' | 'formatted' | null => {
    const raw = readStringOption(value);
    if (raw === null) return null;
    if (raw !== 'raw' && raw !== 'formatted') {
        throw new CliError({
            code: 'USAGE',
            message: `--value-format 非法：${raw}`,
            hint: '可选值：raw | formatted',
        });
    }
    return raw;
};

/** `--sort fieldId[:asc|desc]`（可重复）→ vizConfig.sorts */
const parseSorts = (
    value: unknown,
): Array<{ fieldId: string; descending: boolean }> => {
    const sorts: Array<{ fieldId: string; descending: boolean }> = [];
    for (const entry of readRepeatable(value)) {
        const separator = entry.lastIndexOf(':');
        let fieldId = entry;
        let descending = false;
        if (separator > 0) {
            const direction = entry.slice(separator + 1).trim().toLowerCase();
            if (direction === 'desc' || direction === 'asc') {
                fieldId = entry.slice(0, separator).trim();
                descending = direction === 'desc';
            }
        }
        if (fieldId === '') {
            throw new CliError({
                code: 'USAGE',
                message: `--sort 格式非法：${entry}`,
                hint: '格式 --sort <fieldId:asc|desc>，例如 --sort total_cls4_amount:desc',
            });
        }
        sorts.push({ fieldId, descending });
    }
    return sorts;
};

/** metricQuery 过滤值可能是 {value: x} 包装（FilterRuleValue），翻译时解包 */
const unwrapFilterValue = (value: unknown): unknown => {
    if (isRecord(value) && 'value' in value) {
        return value.value;
    }
    return value;
};

/**
 * Explorer 过滤组（FilterGroup `{id, and|or: [rule]}`）→ v2 扁平规则数组。
 * rule 的 fieldId 在 target.fieldId 上；operator 缺省 equals；values 解包。
 */
const translateFilterGroup = (
    group: unknown,
    label: string,
    warnings: string[],
): SemanticFilterRule[] | null => {
    if (group === null || group === undefined) return null;
    let rules: unknown[];
    if (Array.isArray(group)) {
        rules = group;
    } else if (isRecord(group) && Array.isArray(group.and)) {
        rules = group.and;
    } else if (isRecord(group) && Array.isArray(group.or)) {
        warnings.push(
            `metricQuery.filters.${label} 使用了 or 组合，v2 扁平过滤为 AND 语义，已按 AND 展开输出`,
        );
        rules = group.or;
    } else {
        warnings.push(
            `忽略无法识别的 metricQuery.filters.${label} 结构（期望 {and:[…]} 或规则数组）`,
        );
        return null;
    }

    /** rule → 扁平规则；fieldId 在 target.fieldId（兼容顶层 fieldId） */
    const translateRule = (rule: unknown): SemanticFilterRule | null => {
        if (!isRecord(rule)) {
            warnings.push(`忽略非对象的 ${label} 过滤规则`);
            return null;
        }
        const target = isRecord(rule.target) ? rule.target : null;
        let fieldId: string | null = null;
        if (typeof target?.fieldId === 'string' && target.fieldId.trim() !== '') {
            fieldId = target.fieldId.trim();
        } else if (typeof rule.fieldId === 'string' && rule.fieldId.trim() !== '') {
            fieldId = rule.fieldId.trim();
        }
        if (fieldId === null) {
            warnings.push(`忽略缺少 target.fieldId 的 ${label} 过滤规则`);
            return null;
        }
        const operator =
            typeof rule.operator === 'string' && rule.operator.trim() !== ''
                ? rule.operator.trim()
                : 'equals';
        const values = Array.isArray(rule.values)
            ? rule.values.map(unwrapFilterValue)
            : [];
        return { fieldId, operator, values };
    };

    const translated: SemanticFilterRule[] = rules
        .map(translateRule)
        .filter((rule): rule is SemanticFilterRule => rule !== null);
    if (translated.length === 0) return null;
    return translated;
};

/** v2 支持的 metricQuery 顶层键；其余丢弃并告警 */
const SUPPORTED_METRIC_QUERY_KEYS = new Set([
    'exploreName',
    'dimensions',
    'metrics',
    'limit',
    'filters',
    'valueFormat',
]);

const DROPPED_KEY_MESSAGES: Record<string, string> = {
    sorts: 'v2 run_semantic_metric_query 不支持 metricQuery.sorts，已丢弃（按维度+指标默认排序）',
    tableCalculations:
        'v2 run_semantic_metric_query 不支持 metricQuery.tableCalculations，已丢弃',
    customDimensions:
        'v2 run_semantic_metric_query 不支持 metricQuery.customDimensions，已丢弃',
    customMetrics:
        'v2 run_semantic_metric_query 不支持 metricQuery.customMetrics，已丢弃',
};

const readStringArrayField = (
    value: unknown,
    key: string,
    warnings: string[],
): string[] => {
    if (value === undefined || value === null) return [];
    if (!Array.isArray(value)) {
        warnings.push(`忽略非法的 metricQuery.${key}（期望字符串数组）`);
        return [];
    }
    return value.filter((item): item is string => typeof item === 'string');
};

/**
 * 纯函数：Explorer metricQuery JSON → run_semantic_metric_query 入参。
 * 缺 exploreName → USAGE；v2 不支持的字段丢弃并写入 warnings。
 */
export const translateMetricQuery = (raw: unknown): {
    args: Record<string, unknown>;
    warnings: string[];
} => {
    if (!isRecord(raw)) {
        throw new CliError({
            code: 'USAGE',
            message: 'metricQuery 必须是 JSON 对象',
            hint: '从 Explorer 复制查询 JSON（含 exploreName / dimensions / metrics）',
        });
    }
    const warnings: string[] = [];

    const exploreName =
        typeof raw.exploreName === 'string' ? raw.exploreName.trim() : '';
    if (exploreName === '') {
        throw new CliError({
            code: 'USAGE',
            message: 'metricQuery 缺少必填字段 exploreName',
            hint: 'v2 查询必须显式指定表名；从 Explorer 复制的 JSON 顶层应含 exploreName',
        });
    }

    // metrics 是 v2 必填键：缺省补 []
    const metrics = readStringArrayField(raw.metrics, 'metrics', warnings);
    const args: Record<string, unknown> = { exploreName, metrics };

    const dimensions = readStringArrayField(
        raw.dimensions,
        'dimensions',
        warnings,
    );
    if (dimensions.length > 0) {
        args.dimensions = dimensions;
    }

    if (raw.limit !== undefined && raw.limit !== null) {
        const limit = Number(raw.limit);
        if (Number.isInteger(limit) && limit >= 1) {
            args.limit = limit;
        } else {
            warnings.push(`忽略非法的 metricQuery.limit：${JSON.stringify(raw.limit)}`);
        }
    }

    if (raw.valueFormat !== undefined) {
        if (raw.valueFormat === 'raw' || raw.valueFormat === 'formatted') {
            args.valueFormat = raw.valueFormat;
        } else {
            warnings.push(
                `忽略非法的 metricQuery.valueFormat：${JSON.stringify(raw.valueFormat)}（可选 raw|formatted）`,
            );
        }
    }

    if (raw.filters !== undefined && raw.filters !== null) {
        if (isRecord(raw.filters)) {
            const dimensionRules = translateFilterGroup(
                raw.filters.dimensions,
                'dimensions',
                warnings,
            );
            const metricRules = translateFilterGroup(
                raw.filters.metrics,
                'metrics',
                warnings,
            );
            if (dimensionRules !== null || metricRules !== null) {
                args.filters = {
                    ...(dimensionRules !== null ? { dimensions: dimensionRules } : {}),
                    metrics: metricRules ?? [],
                };
            }
        } else {
            warnings.push('忽略无法识别的 metricQuery.filters 结构（期望对象）');
        }
    }

    const droppedKeys = Object.keys(raw).filter(
        (key) =>
            !SUPPORTED_METRIC_QUERY_KEYS.has(key) &&
            raw[key] !== undefined &&
            raw[key] !== null,
    );
    for (const key of droppedKeys) {
        warnings.push(
            DROPPED_KEY_MESSAGES[key] ??
                `v2 run_semantic_metric_query 不支持 metricQuery.${key}，已丢弃`,
        );
    }

    return { args, warnings };
};

/** `--file` 文本 → ToolCall（集成层读取文件后调用；warnings 由调用方打 stderr） */
export const buildQueryFileCalls = (
    text: string,
    projectUuid: string | null,
): { calls: ToolCall[]; warnings: string[] } => {
    let raw: unknown;
    try {
        raw = JSON.parse(text);
    } catch (error) {
        throw new CliError({
            code: 'USAGE',
            message: '--file 内容不是合法 JSON',
            hint: '从 Explorer 复制 metricQuery JSON（对象）',
            cause: error,
        });
    }
    const { args, warnings } = translateMetricQuery(raw);
    return {
        calls: [
            {
                tool: 'run_semantic_metric_query',
                args: withProject(args, projectUuid),
            },
        ],
        warnings,
    };
};

/** flags → run_semantic_metric_query 入参（--file 由集成层另行处理） */
const buildSemanticQueryArgs = (
    input: CommandBuildInput,
): Record<string, unknown> => {
    const { options } = input;
    const explore = readStringOption(options.explore);
    if (explore === null) {
        throw new CliError({
            code: 'USAGE',
            message: '缺少必填选项 -e/--explore <name>',
            hint: '先运行 msy-x explores list 查看可用表名（exploreName）',
        });
    }

    // metrics 是 v2 必填键：缺省补 []
    const args: Record<string, unknown> = {
        exploreName: explore,
        metrics: parseFieldList(options.metrics, '--metrics'),
    };

    const dimensions = parseFieldList(options.dimensions, '--dimensions');
    if (dimensions.length > 0) {
        args.dimensions = dimensions;
    }

    const limit = parseLimit(options.limit);
    if (limit !== null) {
        args.limit = limit;
    }

    const valueFormat = parseValueFormat(options.valueFormat);
    if (valueFormat !== null) {
        args.valueFormat = valueFormat;
    }

    const dashboard = readStringOption(options.dashboard);
    if (dashboard !== null) {
        args.dashboardUuid = dashboard;
    }

    const filterRules = parseFilterFlags(options.filter);
    const jsonFilters = parseFiltersJsonObject(options.filtersJson, '--filters-json');
    if (jsonFilters !== null || filterRules.length > 0) {
        const merged: Record<string, unknown> = { ...jsonFilters };
        if (filterRules.length > 0) {
            const baseDimensions = Array.isArray(merged.dimensions)
                ? (merged.dimensions as unknown[])
                : [];
            merged.dimensions = [...baseDimensions, ...filterRules];
        }
        // v2 口径：filters.metrics 键总是存在（无指标过滤时为 []）
        if (!Array.isArray(merged.metrics)) {
            merged.metrics = [];
        }
        args.filters = merged;
    }

    return withProject(args, input.projectUuid);
};

/** flags → run_metric_query 入参（vizConfig；--filter 不支持） */
const buildFlatQueryArgs = (
    input: CommandBuildInput,
): Record<string, unknown> => {
    const { options } = input;
    if (readRepeatable(options.filter).length > 0) {
        throw new CliError({
            code: 'USAGE',
            message: 'query flat 不支持 --filter',
            hint: "vizConfig 过滤规则需要 fieldType/fieldFilterType，无法从 fieldId=value 推出；改用 msy-x query --filter，或用 --filters-json 传完整规则（含 fieldType + fieldFilterType）",
        });
    }
    const explore = readStringOption(options.explore);
    if (explore === null) {
        throw new CliError({
            code: 'USAGE',
            message: '缺少必填选项 -e/--explore <name>',
            hint: '先运行 msy-x explores list 查看可用表名（exploreName）',
        });
    }

    const vizConfig: Record<string, unknown> = {
        exploreName: explore,
        metrics: parseFieldList(options.metrics, '--metrics'),
        dimensions: parseFieldList(options.dimensions, '--dimensions'),
        sorts: parseSorts(options.sort),
        limit: parseLimit(options.limit), // vizConfig.limit 必填：缺省 null（服务端默认 500）
    };

    const args: Record<string, unknown> = { vizConfig };

    const jsonFilters = parseFiltersJsonObject(options.filtersJson, '--filters-json');
    if (jsonFilters !== null) {
        args.filters = jsonFilters;
    }

    const dashboard = readStringOption(options.dashboard);
    if (dashboard !== null) {
        args.dashboardUuid = dashboard;
    }

    return withProject(args, input.projectUuid);
};

export const queryCommands: CommandSpec[] = [
    {
        name: 'query',
        description: '语义化查数（run_semantic_metric_query）：扁平参数或 --file 翻译',
        options: [
            {
                flags: '-e, --explore <name>',
                description: '目标表（exploreName），必填',
            },
            {
                flags: '--dimensions <a,b>',
                description: '维度 fieldId，逗号分隔',
            },
            {
                flags: '--metrics <x,y>',
                description: '指标 fieldId，逗号分隔（v2 必填键，缺省空数组）',
            },
            {
                flags: '--filter <fieldId=value>',
                description: '维度等值过滤，可重复，多值逗号分隔（operator=equals）',
            },
            {
                flags: '--filters-json <json>',
                description: "完整 filters 对象（复杂条件），例 '{\"dimensions\":[…],\"metrics\":[]}'",
            },
            {
                flags: '--limit <n>',
                description: '行数上限（默认 500，受服务端封顶）',
            },
            {
                flags: '--value-format <raw|formatted>',
                description: '单元格取值格式（默认 raw）',
            },
            {
                flags: '--dashboard <uuid>',
                description: '强制看板模式下关联的看板 UUID',
            },
            {
                flags: '--file <path|->',
                description: '从 Explorer metricQuery JSON 文件（或 stdin）读取并本地翻译成 v2 参数',
            },
        ],
        example:
            'msy-x query -e pinleibaohsm_cls_top --dimensions cls_4 --metrics total_cls4_amount --filter period=2026Q2',
        dataCommand: true,
        build: (input: CommandBuildInput): ToolCall[] => {
            // --file：文件读取在集成层完成（需读盘/stdin），内容经 fileContent 注入
            if (readStringOption(input.options.file) !== null) {
                const content = input.options.fileContent;
                if (typeof content !== 'string') {
                    throw new CliError({
                        code: 'USAGE',
                        message: 'query --file 由 CLI 集成层读取文件后调用',
                        hint: '直接运行 msy-x query --file <path|->，或在单测中调用 buildQueryFileCalls',
                    });
                }
                return buildQueryFileCalls(content, input.projectUuid).calls;
            }
            return [
                {
                    tool: 'run_semantic_metric_query',
                    args: buildSemanticQueryArgs(input),
                },
            ];
        },
    },
    {
        name: 'query flat',
        description:
            '（实验）run_metric_query 原始表查询：vizConfig 入参，CSV 返回；'
            + '依赖服务端判别键修复（设计稿 §10.4）',
        options: [
            {
                flags: '-e, --explore <name>',
                description: '目标表（exploreName），必填',
            },
            {
                flags: '--filter <fieldId=value>',
                description: '不支持：vizConfig 过滤规则需 fieldType/fieldFilterType；改用 msy-x query --filter 或 --filters-json',
            },
            {
                flags: '--dimensions <a,b>',
                description: '维度 fieldId，逗号分隔',
            },
            {
                flags: '--metrics <x,y>',
                description: '指标 fieldId，逗号分隔（vizConfig 必填键，缺省空数组）',
            },
            {
                flags: '--sort <fieldId:asc|desc>',
                description: '排序，可重复，缺省 asc',
            },
            {
                flags: '--filters-json <json>',
                description: '完整 filters 对象（每条规则需 fieldType + fieldFilterType）',
            },
            {
                flags: '--limit <n>',
                description: '行数上限（vizConfig.limit；缺省 null → 服务端默认 500）',
            },
            {
                flags: '--dashboard <uuid>',
                description: '强制看板模式下关联的看板 UUID',
            },
        ],
        example:
            'msy-x query flat -e pinleibaohsm_cls_top --dimensions cls_4 --metrics total_cls4_amount --sort total_cls4_amount:desc',
        dataCommand: true,
        build: (input: CommandBuildInput): ToolCall[] => [
            { tool: 'run_metric_query', args: buildFlatQueryArgs(input) },
        ],
    },
];
