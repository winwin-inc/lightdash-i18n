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
 * - 递归处理顶层 + layer（含嵌套 layer）
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
 * null / undefined 视为缺失值跳过
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
        if (value === null || value === undefined) {
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
            const domain = extractDomainValues(series, field);
            if (domain.length > 0) {
                const range = domain.map((value) =>
                    resolveColor(String(value), field),
                );
                const syncedColor = {
                    ...color,
                    scale: buildSyncedScale(color.scale, domain, range),
                };
                encoding = {
                    ...(isRecord(encoding) ? encoding : {}),
                    color: syncedColor,
                };
                domain.forEach((value) => {
                    const key = String(value);
                    if (!seenKeys.has(key)) {
                        seenKeys.add(key);
                        visibleKeys.push(key);
                    }
                });
                injected = true;
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
