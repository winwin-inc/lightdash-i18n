/**
 * 自定义图表（Vega-Lite）跟随看板同步颜色 —— 纯函数模块
 *
 * 目标：把看板色表按系列名映射成 vega-lite 的 color scale（domain + range），
 * 注入到自定义图表 spec 里，做到跨图表同名系列同色。
 *
 * 约束（与 docs/vega-lite-dashboard-color-sync.md 一致）：
 * - 只处理 `encoding.color`：必须有 `field` 且 `type` 为 nominal / ordinal
 * - `encoding.color.scale.range` 是数组时视为用户显式指定，不覆盖
 * - `scale.scheme` 存在时视为可覆盖（删除 scheme，改写为 domain + range）
 * - condition 条件编码 / 连续色阶（quantitative、temporal）跳过
 * - domain 由数据推导：field 在 series 中不存在（transform 计算列）时跳过
 * - 递归处理顶层 + layer（含嵌套 layer）与 hconcat/vconcat/concat/facet/repeat
 * - `encoding.color.sort`（用户指定的图例/配色顺序）会被尊重：按聚合值排序 domain
 * - 数据里存在 null 分类时，null 会进 domain 并配一个中性灰（与 vega-lite 默认行为一致）
 */

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
 * 该 color 编码是否「结构上」允许注入颜色映射：
 * - 非 condition 形式
 * - 有 field 字符串
 * - type 为 nominal / ordinal
 * - scale.range 不是数组（用户显式配色不覆盖）
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
    const scale = color.scale;
    if (isRecord(scale) && Array.isArray(scale.range)) {
        // 用户显式指定了颜色数组 → 不覆盖
        return false;
    }
    return true;
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

    function walk(view: unknown): unknown {
        if (!isRecord(view)) {
            return view;
        }

        let encoding: unknown = view.encoding;
        const color = getColorEncoding(view);

        if (color !== null && isInjectableColorEncoding(color)) {
            const field = color.field as string;
            const sort = parseColorSort(view, color);
            if (sort.kind !== 'unsupported') {
                const rawDomain = extractDomainValues(series, field);
                // null 分类单独处理：不占用看板色表槽位，配中性灰
                const hasNull = rawDomain.some((value) => value === null);
                const colorValues = rawDomain.filter((value) => value !== null);
                if (colorValues.length > 0) {
                    let domain: unknown[];
                    if (sort.kind === 'sort') {
                        domain = sortDomainByAggregate(
                            colorValues,
                            series,
                            field,
                            sort,
                        );
                    } else if (sort.kind === 'preserve') {
                        // sort: false → 保持数据出现顺序
                        domain = colorValues;
                    } else {
                        // 无 sort / sort: true → 与 vega-lite 默认一致：按值升序
                        domain = sortDomainNaturally(colorValues);
                    }
                    const range = domain.map((value) =>
                        resolveColor(String(value), field),
                    );
                    const finalDomain = hasNull ? [null, ...domain] : domain;
                    const finalRange = hasNull
                        ? [NULL_CATEGORY_COLOR, ...range]
                        : range;
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
        }

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

    const nextSpec = walk(spec);
    return {
        // 无任何可注入编码时原样返回 spec
        spec: injected ? (nextSpec as Record<string, unknown>) : spec,
        visibleKeys,
    };
};
