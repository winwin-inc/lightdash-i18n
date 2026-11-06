import { View, parse } from 'vega';
import { compile } from 'vega-lite';

type Row = Record<string, unknown>;

/**
 * 自动推导颜色分类值的行数上限。
 * 超过这个量级就不在渲染期跑 transform（避免大结果集卡住主线程），
 * 此时计算列的分类色需要用户显式写 `scale.domain`。
 *
 * 实测：10 万行约 60ms（且同一份数据 + transform 只算一次，有缓存）。
 */
const MAX_DERIVED_ROWS = 100000;

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * 用 vega-lite 编译 transform 链，取出 vega 运行时能直接执行的 transform 列表。
 *
 * 借助 vega-lite 自己的编译结果，`calculate` / `fold` / `filter` / `joinaggregate` /
 * `window` / `aggregate` / `bin` / `timeUnit` 等所有 transform 的语义
 * 都与图表渲染时完全一致，不需要我们逐个手写映射。
 *
 * @returns vega transform 列表；编译失败时返回 null
 */
const compileVegaTransforms = (
    transforms: Row[],
): Record<string, unknown>[] | null => {
    try {
        const compiled = compile({
            data: { name: 'source' },
            transform: transforms,
            // 只是为了拿到 transform 管线，mark/encoding 不参与
            mark: 'point',
        });
        const datasets = (compiled.spec as { data?: Row[] }).data ?? [];
        const derived = datasets.find(
            (dataset) =>
                dataset.source === 'source' && Array.isArray(dataset.transform),
        );
        if (!derived || !Array.isArray(derived.transform)) {
            return null;
        }
        return derived.transform as Record<string, unknown>[];
    } catch {
        // transform 非法 → 放弃自动推导
        return null;
    }
};

/**
 * 本地执行 vega-lite 的 transform 链，得到派生数据。
 *
 * 用途：颜色字段是 transform 计算列（如 `calculate` 出来的 `_net_sign`）时，
 * 原始数据里没有这个字段，无法推导分类集合；这里在渲染期复算一遍，
 * 用户就不必再手写 `scale.domain`。
 *
 * 用真正的 vega 运行时执行，表达式语义（isValid / toNumber / max / abs ...）
 * 与图表渲染时完全一致。
 *
 * @returns 派生后的行；无法计算时返回 null（调用方保持原行为）
 */
export const computeDerivedRows = (
    rows: Row[],
    transforms: Row[],
): Row[] | null => {
    if (transforms.length === 0) {
        return rows;
    }
    if (rows.length > MAX_DERIVED_ROWS) {
        return null;
    }
    if (!transforms.every((transform) => isRecord(transform))) {
        return null;
    }

    const vegaTransforms = compileVegaTransforms(transforms);
    if (vegaTransforms === null) {
        return null;
    }
    if (vegaTransforms.length === 0) {
        return rows;
    }

    try {
        const view = new View(
            parse({
                $schema: 'https://vega.github.io/schema/vega/v5.json',
                data: [
                    { name: 'source', values: rows },
                    {
                        name: 'output',
                        source: 'source',
                        // vega 的 transform 类型是精确联合类型，这里统一转成
                        // vega 自己的 Transforms（运行时才会校验）
                        transform: vegaTransforms as never[],
                    },
                ],
                marks: [],
            }),
            { renderer: 'none' },
        );
        view.run();
        const output = view.data('output');
        view.finalize();
        // vega 会给每行加一个内部 id（Symbol），用不上也影响序列化，去掉
        return (output as Row[]).map((row) => {
            Object.getOwnPropertySymbols(row).forEach((symbol) => {
                delete (row as Record<symbol, unknown>)[symbol];
            });
            return row;
        });
    } catch {
        // 表达式非法 / vega 运行时异常 → 放弃自动推导
        return null;
    }
};
