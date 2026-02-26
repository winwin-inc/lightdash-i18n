/**
 * Vega-Lite spec 的 label → fieldId 改写：当 spec.rewrite === true 时，将「中文/带表名」等 label
 * 统一替换为当前探索的 fieldId，以便注入的 data.values 能正确绑定。
 *
 * 覆盖：encoding/transform 中的 field、key、fields、groupby、default、pivot、value、
 * repeat 的 row/column/layer，calculate/filter/test/expr 中的 datum 引用；
 * aggregate/joinaggregate 的 op.field；sort 的 field。仅对 data.name===values 或含
 * lookup from values 的上下文改写，避免误改 URL/内联数据层。
 *
 * 不改写：transform 的 as 值（market_share、brand_name 等计算字段名），以及 encoding
 * condition 的 value 字面量（如 value: "white"）；后者非字段引用，不会出现在 map 中。
 */
import {
    getItemLabel,
    getItemLabelWithoutTableName,
    type ItemsMap,
} from '@lightdash/common';

const REWRITE_KEY = 'rewrite';

/** 从表达式中提取 datum["..."] 与 datum['...'] 里的字段名 */
function extractDatumRefsFromExpr(expr: string): Set<string> {
    const out = new Set<string>();
    if (typeof expr !== 'string') return out;
    const reDouble = /datum\["([^"]+)"\]/g;
    let m: RegExpExecArray | null;
    while ((m = reDouble.exec(expr)) !== null) out.add(m[1]);
    const reSingle = /datum\['([^']+)'\]/g;
    while ((m = reSingle.exec(expr)) !== null) out.add(m[1]);
    return out;
}

/** 递归收集 spec 中所有 transform 的 "as" 值，这些是计算字段名，不应映射到数据列 */
function collectAsFieldNames(obj: unknown): Set<string> {
    const names = new Set<string>();
    function addAs(v: unknown): void {
        if (typeof v === 'string' && v.trim() !== '') names.add(v.trim());
        else if (Array.isArray(v)) v.forEach(addAs);
    }
    function walk(o: unknown): void {
        if (o === null || typeof o !== 'object') return;
        if (Array.isArray(o)) {
            o.forEach(walk);
            return;
        }
        const raw = o as Record<string, unknown>;
        if (raw.as !== undefined) addAs(raw.as);
        if (Array.isArray(raw.window)) {
            raw.window.forEach((w: unknown) => {
                if (
                    typeof w === 'object' &&
                    w !== null &&
                    'as' in (w as object)
                )
                    addAs((w as Record<string, unknown>).as);
            });
        }
        for (const key of Object.keys(raw)) walk(raw[key]);
    }
    walk(obj);
    return names;
}

/** 仅当引用来自「values」数据时收集：data.name===values 的 layer，或含 lookup from values 的 transform 数组 */
function collectSpecFieldRefNamesInValuesContext(
    obj: unknown,
    isValuesDataRef: (data: unknown) => boolean,
    isLookupFromValuesRef: (raw: Record<string, unknown>) => boolean,
): Set<string> {
    const names = new Set<string>();
    function walk(o: unknown, inValuesContext: boolean): void {
        if (o === null || typeof o !== 'object') return;
        if (Array.isArray(o)) {
            const hasLookupFromValues = o.some(
                (item) =>
                    typeof item === 'object' &&
                    item !== null &&
                    !Array.isArray(item) &&
                    isLookupFromValuesRef(item as Record<string, unknown>),
            );
            const effective = inValuesContext || hasLookupFromValues;
            o.forEach((item) => walk(item, effective));
            return;
        }
        const raw = o as Record<string, unknown>;
        let ctx = inValuesContext;
        if (raw.data !== undefined) {
            if (isValuesDataRef(raw.data)) ctx = true;
            else ctx = false;
        }
        if (ctx) {
            for (const key of Object.keys(raw)) {
                const value = raw[key];
                if (
                    key === 'field' ||
                    key === 'key' ||
                    key === 'pivot' ||
                    key === 'value'
                ) {
                    if (typeof value === 'string') names.add(value);
                } else if (
                    (key === 'fields' ||
                        key === 'groupby' ||
                        key === 'row' ||
                        key === 'column' ||
                        key === 'layer') &&
                    Array.isArray(value)
                ) {
                    value.forEach((v) => {
                        if (typeof v === 'string') names.add(v);
                    });
                } else if (
                    key === 'default' &&
                    value !== null &&
                    typeof value === 'object' &&
                    !Array.isArray(value)
                ) {
                    Object.keys(value as Record<string, unknown>).forEach((k) =>
                        names.add(k),
                    );
                } else if (
                    (key === 'calculate' ||
                        key === 'filter' ||
                        key === 'test' ||
                        key === 'expr') &&
                    typeof value === 'string'
                ) {
                    extractDatumRefsFromExpr(value).forEach((n) =>
                        names.add(n),
                    );
                } else if (
                    key === 'symbolOpacity' &&
                    value !== null &&
                    typeof value === 'object' &&
                    !Array.isArray(value)
                ) {
                    const sym = value as Record<string, unknown>;
                    if (typeof sym.expr === 'string') {
                        extractDatumRefsFromExpr(sym.expr).forEach((n) =>
                            names.add(n),
                        );
                    }
                }
            }
        }
        for (const key of Object.keys(raw)) {
            walk(raw[key], ctx);
        }
    }
    walk(obj, false);
    return names;
}

/** 方案 C - 数据优先：用数据列名直接匹配 spec 引用，优先于 itemsMap */
function buildMapFromDataKeys(
    spec: Record<string, unknown>,
    fieldIds: string[],
): Record<string, string> {
    const map: Record<string, string> = {};
    const calculatedFieldNames = collectAsFieldNames(spec);
    const refNames = collectSpecFieldRefNamesInValuesContext(
        spec,
        (data) =>
            typeof data === 'object' &&
            data !== null &&
            (data as Record<string, unknown>).name === 'values',
        (raw) => {
            const from = raw.from;
            if (from === undefined || typeof from !== 'object' || from === null)
                return false;
            const d = (from as Record<string, unknown>).data;
            return (
                d !== undefined &&
                typeof d === 'object' &&
                d !== null &&
                (d as Record<string, unknown>).name === 'values'
            );
        },
    );
    const fieldIdSet = new Set(fieldIds);
    for (const ref of refNames) {
        if (calculatedFieldNames.has(ref)) continue;
        if (fieldIdSet.has(ref)) {
            map[ref] = ref;
        } else {
            const suffixMatch = fieldIds.find(
                (id) => id === ref || id.endsWith(` ${ref}`),
            );
            if (suffixMatch) map[ref] = suffixMatch;
        }
    }
    for (const id of fieldIds) {
        if (!(id in map)) map[id] = id;
    }
    return map;
}

/** 仅对出现在 data values 中的字段构建 label → fieldId 映射；含无表名与带表名（tableLabel + label）两种 key，重复时按 fieldId 字典序取第一个 */
export function buildLabelToFieldIdMap(
    itemsMap: ItemsMap | undefined,
    fieldIds: string[],
): Record<string, string> {
    if (!itemsMap || fieldIds.length === 0) return {};
    const map: Record<string, string> = {};
    const sortedIds = [...fieldIds].sort();
    for (const fieldId of sortedIds) {
        const item = itemsMap[fieldId];
        if (!item) continue;
        const labelShort = getItemLabelWithoutTableName(item);
        if (labelShort == null || labelShort === '') continue;
        if (!(labelShort in map)) map[labelShort] = fieldId;
        const labelFull = getItemLabel(item);
        if (
            labelFull !== labelShort &&
            labelFull !== '' &&
            !(labelFull in map)
        ) {
            map[labelFull] = fieldId;
        }
    }
    return map;
}

/**
 * 用 spec 中出现的引用名补全映射：仅处理「values 上下文」中的、且尚未映射且不是 fieldId 的引用名，
 * 与尚未被任何 label 映射的 fieldId 按数量一一对应补全。
 */
function fillLabelToFieldIdFromSpec(
    spec: Record<string, unknown>,
    labelToFieldId: Record<string, string>,
    fieldIds: string[],
): void {
    const fieldIdSet = new Set(fieldIds);
    const calculatedFieldNames = collectAsFieldNames(spec);
    const refNames = collectSpecFieldRefNamesInValuesContext(
        spec,
        (data) =>
            typeof data === 'object' &&
            data !== null &&
            (data as Record<string, unknown>).name === 'values',
        (raw) => {
            const from = raw.from;
            if (from === undefined || typeof from !== 'object' || from === null)
                return false;
            const d = (from as Record<string, unknown>).data;
            return (
                d !== undefined &&
                typeof d === 'object' &&
                d !== null &&
                (d as Record<string, unknown>).name === 'values'
            );
        },
    );
    const mappedFieldIds = new Set(Object.values(labelToFieldId));
    const unmappedRefs = [...refNames]
        .filter(
            (r) =>
                !(r in labelToFieldId) &&
                !fieldIdSet.has(r) &&
                !calculatedFieldNames.has(r),
        )
        .sort();
    let unmappedFieldIds = fieldIds.filter((id) => !mappedFieldIds.has(id));

    // 优先：数量相等时按序 1:1 补全
    if (
        unmappedRefs.length === unmappedFieldIds.length &&
        unmappedRefs.length > 0
    ) {
        for (let i = 0; i < unmappedRefs.length; i += 1) {
            labelToFieldId[unmappedRefs[i]] = unmappedFieldIds[i];
        }
        return;
    }
    // 回退：按「ref 为 fieldId 后缀」匹配（如 "省份" 匹配 "TOP集团地图 省份"）
    for (const ref of unmappedRefs) {
        const match = unmappedFieldIds.find(
            (id) => id === ref || id.endsWith(` ${ref}`),
        );
        if (match) {
            labelToFieldId[ref] = match;
            unmappedFieldIds = unmappedFieldIds.filter((id) => id !== match);
        }
    }
}

/** 表达式字符串中的 label → fieldId：datum["label"]、datum['label'] 与 datum.label（仅当 label 为合法标识符时） */
function rewriteExpression(
    expr: string,
    labelToFieldId: Record<string, string>,
): string {
    if (!expr || Object.keys(labelToFieldId).length === 0) return expr;
    let out = expr;
    const idLike = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
    const escapeForDouble = (s: string) =>
        s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const escapeForSingle = (s: string) =>
        s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    try {
        for (const [label, fieldId] of Object.entries(labelToFieldId)) {
            const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            out = out.replace(
                new RegExp(`datum\\["${escapedLabel}"\\]`, 'gu'),
                () => `datum["${escapeForDouble(fieldId)}"]`,
            );
            out = out.replace(
                new RegExp(`datum\\['${escapedLabel}'\\]`, 'gu'),
                () => `datum['${escapeForSingle(fieldId)}']`,
            );
            if (idLike.test(label)) {
                const re = new RegExp(`datum\\.${escapedLabel}\\b`, 'g');
                out = out.replace(re, `datum.${fieldId}`);
            }
        }
    } catch {
        return expr;
    }
    return out;
}

function isValuesData(data: unknown): boolean {
    return (
        typeof data === 'object' &&
        data !== null &&
        (data as Record<string, unknown>).name === 'values'
    );
}

/** 当前对象是否为「lookup 来自 values」的 transform 项（需改写 from/key、from/fields、default 键） */
function isLookupFromValues(raw: Record<string, unknown>): boolean {
    const from = raw.from;
    if (from === undefined || typeof from !== 'object' || from === null)
        return false;
    const fromData = (from as Record<string, unknown>).data;
    return fromData !== undefined && isValuesData(fromData);
}

function rewriteSpecRecursive(
    obj: unknown,
    labelToFieldId: Record<string, string>,
    inValuesContext: boolean,
): unknown {
    if (obj === null || typeof obj !== 'object') {
        return obj;
    }
    if (Array.isArray(obj)) {
        const hasLookupFromValues = obj.some(
            (item) =>
                typeof item === 'object' &&
                item !== null &&
                !Array.isArray(item) &&
                isLookupFromValues(item as Record<string, unknown>),
        );
        const effectiveContext = inValuesContext || hasLookupFromValues;
        return obj.map((item) =>
            rewriteSpecRecursive(item, labelToFieldId, effectiveContext),
        );
    }
    const raw = obj as Record<string, unknown>;
    const useValuesHere =
        inValuesContext ||
        (raw.data !== undefined && isValuesData(raw.data)) ||
        isLookupFromValues(raw);

    const result: Record<string, unknown> = {};
    for (const key of Object.keys(raw)) {
        const value = raw[key];
        if (key === 'as') {
            result[key] = value;
        } else if (key === 'field' && typeof value === 'string') {
            result[key] =
                useValuesHere && value in labelToFieldId
                    ? labelToFieldId[value]
                    : value;
        } else if (
            (key === 'key' || key === 'pivot' || key === 'value') &&
            typeof value === 'string'
        ) {
            result[key] =
                useValuesHere && value in labelToFieldId
                    ? labelToFieldId[value]
                    : value;
        } else if (
            (key === 'fields' || key === 'groupby') &&
            Array.isArray(value)
        ) {
            result[key] = useValuesHere
                ? value.map((v) =>
                      typeof v === 'string' && v in labelToFieldId
                          ? labelToFieldId[v]
                          : v,
                  )
                : value;
        } else if (
            (key === 'row' || key === 'column' || key === 'layer') &&
            Array.isArray(value)
        ) {
            result[key] = value.map((item) =>
                typeof item === 'string'
                    ? useValuesHere && item in labelToFieldId
                        ? labelToFieldId[item]
                        : item
                    : rewriteSpecRecursive(item, labelToFieldId, useValuesHere),
            );
        } else if (
            key === 'default' &&
            value !== null &&
            typeof value === 'object' &&
            !Array.isArray(value)
        ) {
            const defObj = value as Record<string, unknown>;
            const newDefault: Record<string, unknown> = {};
            for (const k of Object.keys(defObj)) {
                const newKey =
                    useValuesHere && k in labelToFieldId
                        ? labelToFieldId[k]
                        : k;
                newDefault[newKey] = rewriteSpecRecursive(
                    defObj[k],
                    labelToFieldId,
                    useValuesHere,
                );
            }
            result[key] = newDefault;
        } else if (
            (key === 'calculate' ||
                key === 'filter' ||
                key === 'test' ||
                key === 'expr') &&
            typeof value === 'string'
        ) {
            result[key] = useValuesHere
                ? rewriteExpression(value, labelToFieldId)
                : value;
        } else if (
            typeof value === 'object' &&
            value !== null &&
            key === 'symbolOpacity' &&
            !Array.isArray(value)
        ) {
            const sym = value as Record<string, unknown>;
            if (typeof sym.expr === 'string') {
                result[key] = {
                    ...sym,
                    expr: useValuesHere
                        ? rewriteExpression(sym.expr, labelToFieldId)
                        : sym.expr,
                };
            } else {
                result[key] = rewriteSpecRecursive(
                    value,
                    labelToFieldId,
                    useValuesHere,
                );
            }
        } else {
            result[key] = rewriteSpecRecursive(
                value,
                labelToFieldId,
                useValuesHere,
            );
        }
    }
    return result;
}

/** 递归改写 spec 中的 field / fields / groupby：若值为 label 则替换为 fieldId；仅对 data: { name: "values" } 的 layer 改写，避免误改内联/URL 数据层 */
export function rewriteSpecFieldLabels(
    spec: Record<string, unknown>,
    labelToFieldId: Record<string, string>,
): Record<string, unknown> {
    if (Object.keys(labelToFieldId).length === 0) return spec;
    return rewriteSpecRecursive(spec, labelToFieldId, false) as Record<
        string,
        unknown
    >;
}

const DEBUG_REWRITE = false; // 调试：打印改写前后的 spec
const DEBUG_REWRITE_DIAG = false; // 诊断：打印 fieldIds/itemsMap/labelToFieldId

/** 若 spec.rewrite === true 则构建映射并改写；最终从 spec 中移除 rewrite 键后返回，供传给 VegaLite
 * 映射优先级：1. 数据列名匹配  2. itemsMap（需 spec 中 label 与 explore schema 一致）  3. fillLabelToFieldIdFromSpec 补全
 */
export function prepareSpecForVega(
    spec: Record<string, unknown> | undefined,
    itemsMap: ItemsMap | undefined,
    fieldIds: string[],
): Record<string, unknown> | undefined {
    if (!spec) return undefined;
    const needsRewrite = spec[REWRITE_KEY] === true;
    let out = { ...spec };
    if (needsRewrite && fieldIds.length > 0) {
        const labelToFieldId = buildMapFromDataKeys(out, fieldIds);
        if (DEBUG_REWRITE_DIAG) {
            console.log('[Vega rewrite] 诊断:', {
                fieldIds: fieldIds.slice(0, 10),
                hasItemsMap: !!itemsMap,
                fromDataKeys: { ...labelToFieldId },
            });
        }
        if (itemsMap) {
            const fromItems = buildLabelToFieldIdMap(itemsMap, fieldIds);
            if (DEBUG_REWRITE_DIAG) {
                console.log('[Vega rewrite] itemsMap 映射:', fromItems);
            }
            for (const [label, fid] of Object.entries(fromItems)) {
                if (!(label in labelToFieldId)) labelToFieldId[label] = fid;
            }
        }
        fillLabelToFieldIdFromSpec(out, labelToFieldId, fieldIds);
        if (DEBUG_REWRITE_DIAG) {
            console.log('[Vega rewrite] 最终 labelToFieldId:', labelToFieldId);
        }
        out = rewriteSpecFieldLabels(out, labelToFieldId);
    }
    const { [REWRITE_KEY]: _, ...forVega } = out;
    if (DEBUG_REWRITE && needsRewrite) {
        console.log(
            '[Vega rewrite] 改写后完整 spec (供对比):',
            JSON.stringify(forVega),
        );
    }
    return forVega;
}
