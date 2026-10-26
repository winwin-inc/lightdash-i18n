/**
 * 自定义图表（Vega-Lite）跟随看板同步颜色 —— 纯函数模块
 *
 * 目标：把看板色表按系列名映射成 vega-lite 的 color scale（domain + range），
 * 注入到自定义图表 spec 里，做到跨图表同名系列同色。
 *
 * 约束（与 docs/vega-lite-dashboard-color-sync.md 一致）：
 * - 只处理 `encoding.color`：必须有 `field` 且 `type` 为 nominal / ordinal
 * - `encoding.color.scale.range` 是数组时会被**覆盖**（开启同步即由看板色板接管配色），
 *   覆盖前后的颜色对应关系用于重映射 spec 里的常量色（手绘图例等）
 * - `scale.scheme` 存在时视为可覆盖（删除 scheme，改写为 domain + range）
 * - condition 条件编码 / 连续色阶（quantitative、temporal）跳过
 *   —— 但「无 field 的字面色编码」（`color: { value, condition }`，例如用颜色表达
 *      正/负、达标/未达标）也会被接管：字面色本身作为颜色键，
 *      保证跨图一致、且彼此不同（详见 applyDashboardColorSync）
 * - `scale: null` 跳过（字段值本身就是颜色）
 * - spec 里写死的颜色（`mark.color` / `mark.fill` / `mark.stroke` /
 *   `mark.point.fill` / `mark.point.stroke` / `encoding.fill.value` /
 *   `encoding.stroke.value`）也会被接管：以**字面值本身**作为颜色键，
 *   保证跨图一致、彼此不同；黑/白/灰等中性色（文字、坐标轴、装饰）跳过
 * - domain 来源有两种：
 *   1. 用户显式写了 `scale.domain` 数组 → 直接当作系列集合（不依赖数据，
 *      因此 fold/calculate 产生的计算列也能同步；顺序即渲染顺序，不再排序）
 *   2. 否则由数据推导：field 在 series 中不存在（transform 计算列）时跳过
 * - 递归处理顶层 + layer（含嵌套 layer）与 hconcat/vconcat/concat/facet/repeat
 * - `encoding.color.sort`（用户指定的图例/配色顺序）会被尊重：按聚合值排序 domain
 * - 数据里存在 null 分类时，null 会进 domain 并配一个中性灰（与 vega-lite 默认行为一致）
 */

import { parseToRgb } from 'polished';

/** 图表数据行（列名与 spec 中 encoding.field 一致） */
export type VegaSeriesRow = Record<string, unknown>;

/** spec 内定位一个编码的路径，如 ['layer', 0, 'encoding', 'color'] */
export type VegaSpecPath = Array<string | number>;

/** 可以注入颜色映射的分类色通道类型 */
const CATEGORICAL_COLOR_TYPES = ['nominal', 'ordinal'] as const;

/** 复合视图：子视图放在数组里 */
const COMPOSITE_VIEW_KEYS = ['hconcat', 'vconcat', 'concat'] as const;

/** 复合视图：子视图放在 .spec 里 */
const COMPOSITE_SPEC_HOLDERS = ['facet', 'repeat'] as const;

/** 空值分类（null）用的中性灰：与 vega-lite 默认给 null 分类上色一致 */
const NULL_CATEGORY_COLOR = '#cccccc';

/** 看起来像颜色字面量的字符串（用于常量色重映射） */
const COLOR_LITERAL_PATTERN = /^(#|rgb\(|rgba\(|hsl\(|hsla\()/i;

/** mark / encoding 里可能写死颜色的属性 */
const COLOR_PROPS = ['color', 'fill', 'stroke'] as const;

/**
 * 中性色判定阈值：RGB 三通道最大差值小于该值视为黑/白/灰。
 * 这类颜色通常是文字、坐标轴、装饰，不应该被看板色板接管。
 */
const NEUTRAL_CHANNEL_SPREAD = 16;

/**
 * 是否是中性色（黑 / 白 / 灰）。
 * 解析失败也按中性处理（宁可不改，也不误改）。
 */
export const isNeutralColor = (color: string): boolean => {
    try {
        const { red, green, blue } = parseToRgb(color);
        const max = Math.max(red, green, blue);
        const min = Math.min(red, green, blue);
        return max - min <= NEUTRAL_CHANNEL_SPREAD;
    } catch {
        return true;
    }
};

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 取视图的 encoding.color 定义（非对象 / 缺失时返回 null） */
function getColorEncoding(view: unknown): Record<string, unknown> | null {
    if (!isRecord(view)) {
        return null;
    }
    const encoding = view.encoding;
    if (!isRecord(encoding)) {
        return null;
    }
    const color = encoding.color;
    if (!isRecord(color)) {
        return null;
    }
    return color;
}

/**
 * condition 分支：vega-lite 支持单个对象，也支持数组（按顺序取第一个匹配的）
 */
const getConditionBranches = (
    color: Record<string, unknown>,
): Array<Record<string, unknown>> => {
    const condition = color.condition;
    if (Array.isArray(condition)) {
        return condition.filter(isRecord);
    }
    if (isRecord(condition)) {
        return [condition];
    }
    return [];
};

/**
 * 取 color 编码里写死的颜色字面量：
 * - 基础 `value`（condition 之外的兜底颜色）
 * - condition 各分支的 `value`
 *
 * 保持出现顺序并去重。只认颜色字面量（#hex / rgb() / hsl() ...），
 * 其它字符串（例如具名颜色）保持用户原样，不参与同步。
 */
export const collectLiteralColorValues = (
    color: Record<string, unknown>,
): string[] => {
    const values: string[] = [];
    const push = (value: unknown) => {
        if (typeof value !== 'string') return;
        if (!COLOR_LITERAL_PATTERN.test(value)) return;
        if (!values.includes(value)) {
            values.push(value);
        }
    };
    push(color.value);
    getConditionBranches(color).forEach((branch) => push(branch.value));
    return values;
};

/**
 * 取视图里写死的颜色（mark 级与 encoding.fill/stroke 级）：
 * - `mark.color` / `mark.fill` / `mark.stroke`
 * - `mark.point.color` / `mark.point.fill` / `mark.point.stroke`
 * - `encoding.fill.value` / `encoding.stroke.value`
 *
 * 这些颜色通常代表图里的“系列”（如上期/本期、基准线/对比线），
 * 开启看板颜色同步后由看板色板接管。
 */
export const collectMarkLiteralColors = (
    view: Record<string, unknown>,
): string[] => {
    const values: string[] = [];
    const push = (value: unknown) => {
        if (typeof value !== 'string') return;
        if (!COLOR_LITERAL_PATTERN.test(value)) return;
        if (!values.includes(value)) {
            values.push(value);
        }
    };

    const mark = view.mark;
    if (isRecord(mark)) {
        COLOR_PROPS.forEach((key) => push(mark[key]));
        const point = mark.point;
        if (isRecord(point)) {
            COLOR_PROPS.forEach((key) => push(point[key]));
        }
    }

    const encoding = view.encoding;
    if (isRecord(encoding)) {
        (['fill', 'stroke'] as const).forEach((key) => {
            const channelDef = encoding[key];
            if (isRecord(channelDef)) {
                push(channelDef.value);
            }
        });
    }

    return values;
};

/**
 * 该 color 编码是否「结构上」允许注入颜色映射：
 * - 非 condition 形式
 * - 有 field 字符串
 * - type 为 nominal / ordinal
 * - scale 不是 null（scale: null 表示字段值本身就是颜色）
 *
 * 注意：显式的 `scale.range` **会被覆盖** —— 开启看板颜色同步并选中该图时，
 * 由看板色板接管配色；覆盖前后的颜色对应关系会被用于重映射 spec 里的常量色
 * （例如手绘图例的 `color: { value: '#4169E1' }`）。
 */
function isInjectableColorEncoding(color: Record<string, unknown>): boolean {
    if ('condition' in color) {
        return false;
    }
    if (typeof color.field !== 'string') {
        return false;
    }
    const type = color.type;
    if (
        typeof type !== 'string' ||
        !CATEGORICAL_COLOR_TYPES.includes(type as 'nominal' | 'ordinal')
    ) {
        return false;
    }
    if (color.scale === null) {
        // scale: null → 字段值本身就是颜色（如 '#3CB976'），不能注入 scale
        return false;
    }
    return true;
}

/**
 * 取用户显式写的 `encoding.color.scale.domain` 数组（只接受基础类型值）
 * 返回 null 表示没有显式 domain
 */
function getExplicitColorDomain(
    color: Record<string, unknown>,
): unknown[] | null {
    const scale = color.scale;
    if (!isRecord(scale)) {
        return null;
    }
    const domain = scale.domain;
    if (!Array.isArray(domain) || domain.length === 0) {
        return null;
    }
    const values: unknown[] = [];
    for (const value of domain) {
        if (
            value === null ||
            typeof value === 'string' ||
            typeof value === 'number' ||
            typeof value === 'boolean'
        ) {
            values.push(value);
            continue;
        }
        // Date / 对象等非基础类型 → 视为没有可用的显式 domain
        return null;
    }
    return values;
}

/** color 编码上的 sort 语义 */
type ColorSort =
    | { kind: 'none' }
    | { kind: 'preserve' }
    | { kind: 'unsupported' }
    | {
          kind: 'sort';
          field: string;
          op: string;
          order: 'ascending' | 'descending';
      };

/** 图形是否堆叠度量（bar / area / arc 默认堆叠，可被 mark.stack 关闭） */
const isStackedView = (view: Record<string, unknown>): boolean => {
    const mark = view.mark;
    const markType =
        typeof mark === 'string'
            ? mark
            : isRecord(mark) && typeof mark.type === 'string'
              ? mark.type
              : undefined;
    if (!markType) {
        return false;
    }
    const stackSetting = isRecord(mark) ? mark.stack : undefined;
    if (stackSetting === undefined) {
        return markType === 'bar' || markType === 'area' || markType === 'arc';
    }
    return stackSetting !== null && stackSetting !== false;
};

/**
 * 字段是否是「维度」（分组字段）：
 * - 就是 color 字段本身
 * - 或出现在某个 nominal / ordinal 通道里
 */
const isDimensionField = (
    encoding: Record<string, unknown>,
    field: unknown,
    colorField?: string,
): boolean => {
    if (typeof field !== 'string') {
        return false;
    }
    if (colorField && field === colorField) {
        return true;
    }
    return Object.values(encoding).some(
        (channelEncoding) =>
            isRecord(channelEncoding) &&
            channelEncoding.field === field &&
            (channelEncoding.type === 'nominal' ||
                channelEncoding.type === 'ordinal'),
    );
};

/**
 * 通道的默认聚合方式，与 vega-lite 保持一致
 * （vega-lite: op ?? (isStackedMeasure ? 'sum' : DEFAULT_SORT_OP)）：
 * - 显式 `aggregate` 优先
 * - quantitative 字段且是堆叠度量时为 sum，否则为 min
 * - 其它（nominal / ordinal / temporal / 未知）：min
 */
const defaultAggregateOfChannel = (
    view: Record<string, unknown>,
    encoding: Record<string, unknown>,
    channel: string,
    colorField?: string,
): string => {
    const channelEncoding = encoding[channel];
    if (!isRecord(channelEncoding)) {
        return 'min';
    }
    if (typeof channelEncoding.aggregate === 'string') {
        return channelEncoding.aggregate;
    }
    if (
        channelEncoding.type === 'quantitative' &&
        !isDimensionField(encoding, channelEncoding.field, colorField)
    ) {
        return isStackedView(view) ? 'sum' : 'min';
    }
    return 'min';
};

/**
 * `sort: {field}` 不带 op 时的默认聚合方式，与 vega-lite 一致：
 * 堆叠度量 → sum，否则 → min。
 */
const defaultAggregateOfField = (
    view: Record<string, unknown>,
    encoding: Record<string, unknown>,
    field: string,
    colorField?: string,
): string => {
    if (isDimensionField(encoding, field, colorField)) {
        return 'min';
    }
    return isStackedView(view) ? 'sum' : 'min';
};

/** 可比较的值：数字按数值比较，其它按字符串比较（与 vega-lite 的值排序一致） */
type Comparable = { kind: 'number'; n: number } | { kind: 'string'; s: string };

const toComparable = (value: unknown): Comparable | null => {
    if (typeof value === 'number') {
        return Number.isFinite(value) ? { kind: 'number', n: value } : null;
    }
    if (typeof value === 'boolean') {
        return { kind: 'number', n: value ? 1 : 0 };
    }
    if (value instanceof Date) {
        const time = value.getTime();
        return Number.isFinite(time) ? { kind: 'number', n: time } : null;
    }
    if (typeof value === 'string') {
        return { kind: 'string', s: value };
    }
    return null;
};

const compareComparable = (a: Comparable, b: Comparable): number => {
    if (a.kind === 'number' && b.kind === 'number') {
        return a.n - b.n;
    }
    if (a.kind === 'string' && b.kind === 'string') {
        return a.s < b.s ? -1 : a.s > b.s ? 1 : 0;
    }
    // 混合类型按字符串形式比较，保证顺序确定
    const left = a.kind === 'number' ? String(a.n) : a.s;
    const right = b.kind === 'number' ? String(b.n) : b.s;
    return left < right ? -1 : left > right ? 1 : 0;
};

/** 排序用的数值：数字直接用；字符串尝试转数字 / 解析成时间戳；其它跳过 */
const toSortNumber = (value: unknown): number | null => {
    if (typeof value === 'number') {
        return Number.isFinite(value) ? value : null;
    }
    if (value instanceof Date) {
        const time = value.getTime();
        return Number.isFinite(time) ? time : null;
    }
    if (typeof value === 'string') {
        const numeric = Number(value);
        if (Number.isFinite(numeric)) {
            return numeric;
        }
        const time = Date.parse(value);
        return Number.isFinite(time) ? time : null;
    }
    return null;
};

/**
 * 解析 `encoding.color.sort`（语义对齐 vega-lite 的 parseSortForDomain）：
 * - 无 sort → none（vega-lite 默认：按值升序）
 * - sort: true → preserve（vega-lite 对 boolean sort 不生成 domain sort → 数据出现顺序）
 * - sort: false → preserve（数据出现顺序）
 * - sort: 'ascending' → none（按值升序）
 * - sort: 'descending' → 按 color 字段自身降序（vega-lite: op min + order descending）
 * - sort: {field, op?, order?} → op 默认 min；若该字段是堆叠度量则默认 sum
 * - sort: {encoding, order?} → 用该通道的 aggregate；无 aggregate 时按堆叠规则回落
 * - 无法确定字段 → unsupported（保守跳过注入）
 */
const parseColorSort = (
    view: Record<string, unknown>,
    color: Record<string, unknown>,
): ColorSort => {
    const sort = color.sort;
    if (sort === undefined || sort === null) {
        return { kind: 'none' };
    }
    if (sort === false || sort === true) {
        return { kind: 'preserve' };
    }

    const encoding = isRecord(view.encoding) ? view.encoding : {};
    const colorField = typeof color.field === 'string' ? color.field : undefined;
    const fieldOfChannel = (channel: string): string | undefined => {
        const channelEncoding = encoding[channel];
        if (!isRecord(channelEncoding)) return undefined;
        return typeof channelEncoding.field === 'string'
            ? channelEncoding.field
            : undefined;
    };

    if (typeof sort === 'string') {
        if (sort === 'ascending') {
            return { kind: 'none' };
        }
        if (sort === 'descending') {
            if (!colorField) return { kind: 'unsupported' };
            return {
                kind: 'sort',
                field: colorField,
                op: 'min',
                order: 'descending',
            };
        }
        // 简写：'-y' / 'y'，按对应通道字段的聚合值排序
        const descending = sort.startsWith('-');
        const channel = descending ? sort.slice(1) : sort;
        const field = fieldOfChannel(channel);
        if (!field) return { kind: 'unsupported' };
        return {
            kind: 'sort',
            field,
            op: defaultAggregateOfChannel(view, encoding, channel, colorField),
            order: descending ? 'descending' : 'ascending',
        };
    }

    if (isRecord(sort)) {
        const order = sort.order === 'descending' ? 'descending' : 'ascending';
        if (typeof sort.field === 'string') {
            return {
                kind: 'sort',
                field: sort.field,
                op:
                    typeof sort.op === 'string'
                        ? sort.op
                        : defaultAggregateOfField(
                              view,
                              encoding,
                              sort.field,
                              colorField,
                          ),
                order,
            };
        }
        if (typeof sort.encoding === 'string') {
            const field = fieldOfChannel(sort.encoding);
            if (!field) return { kind: 'unsupported' };
            return {
                kind: 'sort',
                field,
                op:
                    typeof sort.op === 'string'
                        ? sort.op
                        : defaultAggregateOfChannel(
                              view,
                              encoding,
                              sort.encoding,
                              colorField,
                          ),
                order,
            };
        }
    }

    return { kind: 'unsupported' };
};

/**
 * 按值升序排序 domain（与 vega-lite 默认 `sort: true` 一致：
 * 数字按数值比较，字符串按字典序比较），无法比较时保持原顺序。
 */
const sortDomainNaturally = (values: unknown[]): unknown[] => {
    const comparables = values.map(toComparable);
    if (comparables.some((item) => item === null)) {
        return values;
    }
    return values
        .map((value, index) => ({
            value,
            index,
            comparable: comparables[index] as Comparable,
        }))
        .sort((a, b) => {
            const diff = compareComparable(a.comparable, b.comparable);
            return diff !== 0 ? diff : a.index - b.index;
        })
        .map((entry) => entry.value);
};

/** 按聚合值排序 domain（稳定排序，并列保持首次出现顺序） */
const sortDomainByAggregate = (
    domain: unknown[],
    series: VegaSeriesRow[],
    colorField: string,
    sort: { field: string; op: string; order: 'ascending' | 'descending' },
): unknown[] => {
    // 按 color 字段分组，聚合 sort 字段
    const groups = new Map<
        string,
        { numbers: number[]; values: Comparable[]; count: number }
    >();

    for (const row of series) {
        if (!isRecord(row)) continue;
        if (!Object.prototype.hasOwnProperty.call(row, colorField)) continue;
        const groupValue = row[colorField];
        const key = `${typeof groupValue}:${String(groupValue)}`;
        let group = groups.get(key);
        if (!group) {
            group = { numbers: [], values: [], count: 0 };
            groups.set(key, group);
        }
        group.count += 1;
        const raw = row[sort.field];
        const numeric = toSortNumber(raw);
        if (numeric !== null) {
            group.numbers.push(numeric);
        }
        const comparable = toComparable(raw);
        if (comparable !== null) {
            group.values.push(comparable);
        }
    }

    const aggregate = (group: {
        numbers: number[];
        values: Comparable[];
        count: number;
    }): Comparable => {
        const { numbers, values, count } = group;
        switch (sort.op) {
            case 'count':
                return { kind: 'number', n: count };
            case 'mean':
                return {
                    kind: 'number',
                    n: numbers.length
                        ? numbers.reduce((a, b) => a + b, 0) / numbers.length
                        : 0,
                };
            case 'min':
                return values.length
                    ? values.reduce((min, item) =>
                          compareComparable(item, min) < 0 ? item : min,
                      )
                    : { kind: 'number', n: 0 };
            case 'max':
                return values.length
                    ? values.reduce((max, item) =>
                          compareComparable(item, max) > 0 ? item : max,
                      )
                    : { kind: 'number', n: 0 };
            case 'sum':
            default:
                return {
                    kind: 'number',
                    n: numbers.reduce((a, b) => a + b, 0),
                };
        }
    };

    const direction = sort.order === 'descending' ? -1 : 1;
    return domain
        .map((value, index) => {
            const key = `${typeof value}:${String(value)}`;
            const group = groups.get(key);
            return {
                value,
                index,
                score: group
                    ? aggregate(group)
                    : ({ kind: 'number', n: 0 } as Comparable),
            };
        })
        .sort((a, b) => {
            const diff = compareComparable(a.score, b.score);
            if (diff !== 0) {
                return diff * direction;
            }
            return a.index - b.index;
        })
        .map((entry) => entry.value);
};

/**
 * 收集 spec 中需要注入的 color 编码位置（顶层 + layer/复合视图递归），返回 spec 内的路径数组
 */
export const collectCategoricalColorPaths = (
    spec: Record<string, unknown>,
): VegaSpecPath[] => {
    const paths: VegaSpecPath[] = [];

    function walk(view: unknown, prefix: VegaSpecPath): void {
        if (!isRecord(view)) {
            return;
        }
        const color = getColorEncoding(view);
        if (color !== null && isInjectableColorEncoding(color)) {
            paths.push([...prefix, 'encoding', 'color']);
        }
        const layer = view.layer;
        if (Array.isArray(layer)) {
            layer.forEach((child, index) => {
                walk(child, [...prefix, 'layer', index]);
            });
        }
        COMPOSITE_VIEW_KEYS.forEach((key) => {
            const children = view[key];
            if (Array.isArray(children)) {
                children.forEach((child, index) => {
                    walk(child, [...prefix, key, index]);
                });
            }
        });
        COMPOSITE_SPEC_HOLDERS.forEach((key) => {
            const holder = view[key];
            if (isRecord(holder) && isRecord(holder.spec)) {
                walk(holder.spec, [...prefix, key, 'spec']);
            }
        });
    }

    walk(spec, []);
    return paths;
};

/**
 * 取某字段在数据中的去重值，保持原始类型（数值仍是数值），顺序为首次出现顺序
 * null 会被保留（vega-lite 默认会给 null 分类上色，注入时也需要保留）
 */
export const extractDomainValues = (
    series: VegaSeriesRow[],
    field: string,
): unknown[] => {
    const values: unknown[] = [];
    const seen = new Set<string>();

    for (const row of series) {
        if (!isRecord(row)) {
            continue;
        }
        if (!Object.prototype.hasOwnProperty.call(row, field)) {
            // 字段不存在（transform 计算列）→ 取不到值
            continue;
        }
        const value = row[field];
        if (value === undefined) {
            continue;
        }
        // 类型参与去重键：数字 1 与字符串 '1' 是不同的分类值
        const key = `${typeof value}:${String(value)}`;
        if (seen.has(key)) {
            continue;
        }
        seen.add(key);
        values.push(value);
    }

    return values;
};

/** 构造注入用的 scale：保留原有配置，去掉 scheme，写入 domain + range */
function buildSyncedScale(
    scale: unknown,
    domain: unknown[],
    range: string[],
): Record<string, unknown> {
    const base: Record<string, unknown> = isRecord(scale) ? { ...scale } : {};
    delete base.scheme;
    return {
        ...base,
        domain,
        range,
    };
}

/**
 * 按颜色映射改写 spec（不改原对象）
 * @returns 改写后的 spec 与本次可见系列名（String 化后的去重集合，保持出现顺序）
 */
export const applyDashboardColorSync = ({
    spec,
    series,
    resolveColor,
}: {
    spec: Record<string, unknown>;
    series: VegaSeriesRow[];
    resolveColor: (value: string, field: string) => string;
}): { spec: Record<string, unknown>; visibleKeys: string[] } => {
    const visibleKeys: string[] = [];
    const seenKeys = new Set<string>();
    let injected = false;
    /**
     * 旧 range → 新 range 的字面色对应关系。
     * 用于把 spec 里手写的常量色（如手绘图例的 `color: { value: '#4169E1' }`）
     * 一并改成看板色板里的颜色，做到“开启同步即自动接管配色”。
     */
    const literalColorMap = new Map<string, string>();
    /** 语义不明确（同一旧色对应多个新色）的字面色，不做重映射 */
    const ambiguousLiterals = new Set<string>();
    /**
     * 字面色 → 看板色板颜色。
     * 用于「无 field 的字面色编码」（`color: { value, condition }`）：
     * 这类编码没有系列名，颜色本身表达数据含义（例如正=绿、负=红），
     * 因此以 **字面值本身** 作为颜色键：
     * - 跨图一致：所有用 `#d64545` 的地方拿到同一个颜色
     * - 彼此不同：进入看板色表后由避让规则分配不同颜色
     */
    const literalKeyColors = new Map<string, string>();

    /** 把一个字面色注册为看板色表的颜色键，并返回它在色板里的颜色 */
    function registerLiteralKey(literal: string): string | undefined {
        // 颜色字面量大小写不敏感，统一用小写作为颜色键
        const key = literal.toLowerCase();
        // 旧 range 的位置对应关系优先（它才对应真实系列）
        if (literalColorMap.has(key)) return literalColorMap.get(key);
        if (ambiguousLiterals.has(key)) return undefined;
        // 中性色（黑/白/灰）通常是文字、坐标轴、装饰 → 保持用户原样
        if (isNeutralColor(literal)) return undefined;
        if (!literalKeyColors.has(key)) {
            literalKeyColors.set(key, resolveColor(key, ''));
        }
        // 注册到看板色表 → 拿到稳定且互不相同的颜色
        if (!seenKeys.has(key)) {
            seenKeys.add(key);
            visibleKeys.push(key);
        }
        return literalKeyColors.get(key);
    }

    /** 记录旧 range 与新 range 的位置对应关系 */
    function recordLiteralRemap(oldRange: unknown, newRange: string[]): void {
        if (!Array.isArray(oldRange) || oldRange.length === 0) {
            return;
        }
        if (!oldRange.every((value) => typeof value === 'string')) {
            return;
        }
        const oldColors = oldRange as string[];
        // 旧 range 里有重复色 → 语义不明确，跳过
        if (new Set(oldColors).size !== oldColors.length) {
            return;
        }
        oldColors.forEach((oldColor, index) => {
            const newColor = newRange[index];
            if (!newColor || newColor === oldColor) {
                return;
            }
            if (!COLOR_LITERAL_PATTERN.test(oldColor)) {
                return;
            }
            // 颜色字面量大小写不敏感，统一用小写作为键
            const key = oldColor.toLowerCase();
            const existing = literalColorMap.get(key);
            if (existing && existing !== newColor) {
                // 同一旧色在不同视图里对应不同新色 → 标记为歧义
                ambiguousLiterals.add(key);
                literalColorMap.delete(key);
                return;
            }
            if (!ambiguousLiterals.has(key)) {
                literalColorMap.set(key, newColor);
            }
        });
    }

    function walk(view: unknown): unknown {
        if (!isRecord(view)) {
            return view;
        }

        let encoding: unknown = view.encoding;
        const color = getColorEncoding(view);

        if (color !== null && isInjectableColorEncoding(color)) {
            const field = color.field as string;
            const explicitDomain = getExplicitColorDomain(color);
            // 没有显式 domain 时，才需要从数据推导取值与顺序
            const rawDomain = explicitDomain
                ? null
                : extractDomainValues(series, field);
            const sort = explicitDomain ? null : parseColorSort(view, color);

            /** 参与配色的分类值（不含 null），顺序即注册到看板色表的顺序 */
            let colorValues: unknown[] = [];
            /** 写回 scale.domain 的值（可能包含 null） */
            let finalDomain: unknown[] = [];

            if (explicitDomain) {
                // 用户显式指定了 scale.domain → 直接当作系列集合
                // 优势：fold/calculate 产生的计算列也能同步（数据里本来就没有该字段）
                // 顺序：vega-lite 显式 domain 不再排序，直接按用户给的顺序
                colorValues = explicitDomain.filter((value) => value !== null);
                finalDomain = explicitDomain;
            } else if (rawDomain && sort && sort.kind !== 'unsupported') {
                colorValues = rawDomain.filter((value) => value !== null);
                if (colorValues.length > 0) {
                    let ordered: unknown[];
                    if (sort.kind === 'sort') {
                        ordered = sortDomainByAggregate(
                            colorValues,
                            series,
                            field,
                            sort,
                        );
                    } else if (sort.kind === 'preserve') {
                        // sort: false / sort: true → 保持数据出现顺序
                        ordered = colorValues;
                    } else {
                        // 未写 sort / sort: 'ascending' → 与 vega-lite 默认一致：按值升序
                        ordered = sortDomainNaturally(colorValues);
                    }
                    // null 分类单独处理：不占用看板色表槽位，配中性灰
                    const hasNull = rawDomain.some((value) => value === null);
                    finalDomain = hasNull ? [null, ...ordered] : ordered;
                }
            }

            if (finalDomain.length > 0 && colorValues.length > 0) {
                const finalRange = finalDomain.map((value) =>
                    value === null
                        ? NULL_CATEGORY_COLOR
                        : resolveColor(String(value), field),
                );
                // 用户原本写的 range → 记录对应关系，用于重映射 spec 里的常量色
                const oldRange = isRecord(color.scale)
                    ? color.scale.range
                    : undefined;
                recordLiteralRemap(oldRange, finalRange);
                const syncedColor = {
                    ...color,
                    scale: buildSyncedScale(
                        color.scale,
                        finalDomain,
                        finalRange,
                    ),
                };
                encoding = {
                    ...(isRecord(encoding) ? encoding : {}),
                    color: syncedColor,
                };
                // 注册顺序用数据首次出现顺序（与标准图一致），null 不注册
                colorValues.forEach((value) => {
                    const key = String(value);
                    if (!seenKeys.has(key)) {
                        seenKeys.add(key);
                        visibleKeys.push(key);
                    }
                });
                injected = true;
            }
        }

        /**
         * 「无 field 的字面色编码」：颜色本身表达数据含义（正/负、达标/未达标），
         * 没有系列名可对齐，因此以字面值作为颜色键接入看板色表。
         *
         * 限制：
         * - 有 field 的编码不走这里（分类色由 scale 接管，见上）
         * - condition 分支里带 field 的不处理（那个分支用的是自己的 scale）
         * - `scale: null` 不处理（字段值本身就是颜色）
         * - 中性色（黑/白/灰）不处理
         */
        if (color !== null && typeof color.field !== 'string') {
            const branches = getConditionBranches(color);
            const hasFieldBranch = branches.some(
                (branch) => typeof branch.field === 'string',
            );
            const scaleIsNull = color.scale === null;
            if (!hasFieldBranch && !scaleIsNull) {
                collectLiteralColorValues(color).forEach((literal) => {
                    registerLiteralKey(literal);
                });
            }
        }

        /**
         * mark 级写死颜色（`mark.color` / `mark.fill` / `mark.stroke` /
         * `mark.point.*` / `encoding.fill.value` / `encoding.stroke.value`）：
         * 这些颜色在图里往往代表一条“系列”（上期/本期、基准线/对比线），
         * 开启看板颜色同步后同样由看板色板接管。
         */
        collectMarkLiteralColors(view).forEach((literal) => {
            registerLiteralKey(literal);
        });

        let result: Record<string, unknown> = view;
        if (encoding !== view.encoding) {
            result = { ...view, encoding };
        }
        if (Array.isArray(view.layer)) {
            result = {
                ...result,
                layer: view.layer.map((child) => walk(child)),
            };
        }
        COMPOSITE_VIEW_KEYS.forEach((key) => {
            const children = view[key];
            if (Array.isArray(children)) {
                result = {
                    ...result,
                    [key]: children.map((child) => walk(child)),
                };
            }
        });
        COMPOSITE_SPEC_HOLDERS.forEach((key) => {
            const holder = view[key];
            if (isRecord(holder) && isRecord(holder.spec)) {
                result = {
                    ...result,
                    [key]: { ...holder, spec: walk(holder.spec) },
                };
            }
        });
        return result;
    }

    /**
     * 第二遍：把 spec 里手写的常量色改成看板色板里的对应颜色。
     * - `encoding.color.value` / `encoding.color.condition[].value`：
     *   数据颜色 → 优先用旧 range 的位置对应，其次用字面色键的看板颜色
     * - `mark.color` / `mark.fill` / `mark.stroke` / `mark.point.*`：
     *   图形自身的颜色（上期/本期、基准线/对比线等）→ 同样由看板色板接管
     * - `encoding.fill.value` / `encoding.stroke.value`：同上
     * 中性色（黑/白/灰）不入色表，保持用户原样。
     */
    function remapLiterals(view: unknown): unknown {
        if (!isRecord(view)) {
            return view;
        }
        let result: Record<string, unknown> = view;

        const mapDataColor = (value: string): string | undefined => {
            const key = value.toLowerCase();
            return literalColorMap.get(key) ?? literalKeyColors.get(key);
        };

        /** 改写 mark 上的写死颜色：mark.color/fill/stroke 与 mark.point.* */
        const remapMarkColors = (
            mark: Record<string, unknown>,
        ): Record<string, unknown> => {
            let next: Record<string, unknown> = mark;
            const applyProps = (
                source: Record<string, unknown>,
                target: Record<string, unknown>,
            ): Record<string, unknown> => {
                let nextProps = target;
                COLOR_PROPS.forEach((key) => {
                    const value = source[key];
                    if (typeof value !== 'string') return;
                    const mapped = mapDataColor(value);
                    if (!mapped) return;
                    if (nextProps === target) nextProps = { ...target };
                    nextProps[key] = mapped;
                });
                return nextProps;
            };

            next = applyProps(mark, next);
            const point = mark.point;
            if (isRecord(point)) {
                const nextPoint = applyProps(point, point);
                if (nextPoint !== point) {
                    if (next === mark) next = { ...mark };
                    next.point = nextPoint;
                }
            }
            return next;
        };

        const encoding = view.encoding;
        if (isRecord(encoding)) {
            let nextEncoding = encoding;
            const color = encoding.color;
            if (isRecord(color)) {
                let nextColor: Record<string, unknown> = color;
                if (typeof color.value === 'string') {
                    const mapped = mapDataColor(color.value);
                    if (mapped) {
                        nextColor = { ...nextColor, value: mapped };
                    }
                }
                const condition = color.condition;
                if (Array.isArray(condition)) {
                    let changed = false;
                    const branches = condition.map((branch) => {
                        if (
                            !isRecord(branch) ||
                            typeof branch.value !== 'string'
                        ) {
                            return branch;
                        }
                        const mapped = mapDataColor(branch.value);
                        if (!mapped) return branch;
                        changed = true;
                        return { ...branch, value: mapped };
                    });
                    if (changed) {
                        nextColor = { ...nextColor, condition: branches };
                    }
                } else if (
                    isRecord(condition) &&
                    typeof condition.value === 'string'
                ) {
                    const mapped = mapDataColor(condition.value);
                    if (mapped) {
                        nextColor = {
                            ...nextColor,
                            condition: { ...condition, value: mapped },
                        };
                    }
                }
                if (nextColor !== color) {
                    if (nextEncoding === encoding) nextEncoding = { ...encoding };
                    nextEncoding.color = nextColor;
                }
            }
            // `encoding.fill.value` / `encoding.stroke.value`
            (['fill', 'stroke'] as const).forEach((key) => {
                const channelDef = encoding[key];
                if (!isRecord(channelDef)) return;
                if (typeof channelDef.value !== 'string') return;
                const mapped = mapDataColor(channelDef.value);
                if (!mapped) return;
                if (nextEncoding === encoding) nextEncoding = { ...encoding };
                nextEncoding[key] = { ...channelDef, value: mapped };
            });
            if (nextEncoding !== encoding) {
                result = { ...result, encoding: nextEncoding };
            }
        }

        const mark = view.mark;
        if (isRecord(mark)) {
            const nextMark = remapMarkColors(mark);
            if (nextMark !== mark) {
                result = { ...result, mark: nextMark };
            }
        }

        if (Array.isArray(view.layer)) {
            result = {
                ...result,
                layer: view.layer.map((child) => remapLiterals(child)),
            };
        }
        COMPOSITE_VIEW_KEYS.forEach((key) => {
            const children = view[key];
            if (Array.isArray(children)) {
                result = {
                    ...result,
                    [key]: children.map((child) => remapLiterals(child)),
                };
            }
        });
        COMPOSITE_SPEC_HOLDERS.forEach((key) => {
            const holder = view[key];
            if (isRecord(holder) && isRecord(holder.spec)) {
                result = {
                    ...result,
                    [key]: { ...holder, spec: remapLiterals(holder.spec) },
                };
            }
        });
        return result;
    }

    const nextSpec = walk(spec);
    const hasLiteralRemap =
        literalColorMap.size > 0 || literalKeyColors.size > 0;
    const finalSpec = hasLiteralRemap
        ? (remapLiterals(nextSpec) as Record<string, unknown>)
        : (nextSpec as Record<string, unknown>);
    return {
        // 无任何可注入编码时原样返回 spec
        spec: injected || hasLiteralRemap ? finalSpec : spec,
        visibleKeys,
    };
};
