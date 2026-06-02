const V5_SCHEMA = 'https://vega.github.io/schema/vega-lite/v5.json';

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null;

const extractDatumRefs = (expression: string): Set<string> => {
    const refs = new Set<string>();
    const reDouble = /datum\["([^"]+)"\]/g;
    const reSingle = /datum\['([^']+)'\]/g;
    const reDot = /datum\.([a-zA-Z_][a-zA-Z0-9_]*)/g;

    let match: RegExpExecArray | null;
    while ((match = reDouble.exec(expression)) !== null) refs.add(match[1]);
    while ((match = reSingle.exec(expression)) !== null) refs.add(match[1]);
    while ((match = reDot.exec(expression)) !== null) refs.add(match[1]);
    return refs;
};

const collectCalculatedFields = (
    spec: Record<string, unknown>,
): Set<string> => {
    const calculated = new Set<string>();
    const walk = (value: unknown): void => {
        if (Array.isArray(value)) {
            value.forEach(walk);
            return;
        }
        if (!isRecord(value)) return;

        if (typeof value.as === 'string' && value.as.trim()) {
            calculated.add(value.as.trim());
        } else if (Array.isArray(value.as)) {
            value.as.forEach((item) => {
                if (typeof item === 'string' && item.trim()) {
                    calculated.add(item.trim());
                }
            });
        }

        Object.values(value).forEach(walk);
    };

    walk(spec);
    return calculated;
};

const collectPivotInputFields = (
    spec: Record<string, unknown>,
): Set<string> => {
    const pivotInputFields = new Set<string>();
    const transforms = Array.isArray(spec.transform) ? spec.transform : [];

    transforms.forEach((transform) => {
        if (!isRecord(transform)) return;
        if (typeof transform.pivot === 'string' && transform.pivot.trim()) {
            pivotInputFields.add(transform.pivot.trim());
        }
        if (typeof transform.value === 'string' && transform.value.trim()) {
            pivotInputFields.add(transform.value.trim());
        }
        if (Array.isArray(transform.groupby)) {
            transform.groupby.forEach((groupByField) => {
                if (typeof groupByField === 'string' && groupByField.trim()) {
                    pivotInputFields.add(groupByField.trim());
                }
            });
        }
    });

    return pivotInputFields;
};

const collectReferencedFields = (
    spec: Record<string, unknown>,
): Set<string> => {
    const refs = new Set<string>();

    const shouldTreatValueAsField = (record: Record<string, unknown>) =>
        typeof record.pivot === 'string';

    const walk = (value: unknown): void => {
        if (Array.isArray(value)) {
            value.forEach(walk);
            return;
        }
        if (!isRecord(value)) return;

        Object.entries(value).forEach(([key, item]) => {
            if (
                (key === 'field' || key === 'key' || key === 'pivot') &&
                typeof item === 'string'
            ) {
                refs.add(item.trim());
            } else if (
                key === 'value' &&
                typeof item === 'string' &&
                shouldTreatValueAsField(value)
            ) {
                refs.add(item.trim());
            } else if (
                (key === 'fields' ||
                    key === 'groupby' ||
                    key === 'row' ||
                    key === 'column' ||
                    key === 'layer') &&
                Array.isArray(item)
            ) {
                item.forEach((fieldName) => {
                    if (typeof fieldName === 'string' && fieldName.trim()) {
                        refs.add(fieldName.trim());
                    }
                });
            } else if (
                (key === 'calculate' ||
                    key === 'filter' ||
                    key === 'test' ||
                    key === 'expr') &&
                typeof item === 'string'
            ) {
                extractDatumRefs(item).forEach((fieldName) =>
                    refs.add(fieldName),
                );
            }

            walk(item);
        });
    };

    walk(spec);
    return refs;
};

const MUSTACHE_PLACEHOLDER_RE = /\{\{[^}]+\}\}/;

const containsMustachePlaceholder = (value: string): boolean =>
    MUSTACHE_PLACEHOLDER_RE.test(value);

const walkStrings = (value: unknown, visit: (text: string) => void): void => {
    if (typeof value === 'string') {
        visit(value);
        return;
    }
    if (Array.isArray(value)) {
        value.forEach((item) => walkStrings(item, visit));
        return;
    }
    if (!isRecord(value)) return;
    Object.values(value).forEach((item) => walkStrings(item, visit));
};

const layerUsesMustachePlaceholder = (
    layer: Record<string, unknown>,
): boolean => {
    let found = false;
    walkStrings(layer, (text) => {
        if (containsMustachePlaceholder(text)) {
            found = true;
        }
    });
    return found;
};

const dimensionGranularityScore = (fieldId: string): number => {
    if (/(cls_4|四级|lv4|level_4)/i.test(fieldId)) return 400;
    if (/(cls_3|三级|lv3|level_3)/i.test(fieldId)) return 300;
    if (/(cls_2|二级|lv2|level_2)/i.test(fieldId)) return 200;
    if (/(cls_1|一级|lv1|level_1)/i.test(fieldId)) return 100;
    return 0;
};

const pickPrimaryPieDimension = (candidates: string[]): string | null => {
    if (candidates.length === 0) return null;
    const ranked = [...candidates].sort(
        (a, b) => dimensionGranularityScore(b) - dimensionGranularityScore(a),
    );
    return ranked[0] || null;
};

export const isArcPieSpec = (spec: Record<string, unknown>): boolean => {
    const markType = (mark: unknown): string | null => {
        if (typeof mark === 'string') return mark;
        if (isRecord(mark) && typeof mark.type === 'string') {
            return mark.type;
        }
        return null;
    };

    if (markType(spec.mark) === 'arc') return true;
    if (Array.isArray(spec.layer)) {
        return spec.layer.some(
            (layer) => isRecord(layer) && markType(layer.mark) === 'arc',
        );
    }
    return false;
};

const fixArcEncoding = (
    encoding: Record<string, unknown>,
    dimensionField: string,
    metricField: string,
): void => {
    if (isRecord(encoding.color)) {
        delete encoding.color.value;
        encoding.color.field = dimensionField;
        encoding.color.type = encoding.color.type || 'nominal';
    }

    if (isRecord(encoding.theta)) {
        encoding.theta.field = metricField;
        encoding.theta.type = 'quantitative';
        encoding.theta.aggregate = 'sum';
        delete encoding.theta.stack;
    }
};

type SanitizeSpecForExploreOptions = {
    selectedDimensions?: string[];
    selectedMetrics?: string[];
    baselineDimensions?: string[];
    baselineMetrics?: string[];
};

const buildFieldRemap = (
    baselineDimensions: string[],
    baselineMetrics: string[],
    selectedDimensions: string[],
    selectedMetrics: string[],
): Map<string, string> => {
    const remap = new Map<string, string>();

    const pair = (from: string[], to: string[]) => {
        if (to.length === 0) return;
        from.forEach((fromId, index) => {
            const toId = to[index] ?? to[0];
            if (fromId && toId && fromId !== toId) {
                remap.set(fromId, toId);
            }
        });
    };

    pair(baselineDimensions, selectedDimensions);
    pair(baselineMetrics, selectedMetrics);
    return remap;
};

const replaceFieldIdsInSpec = (
    spec: Record<string, unknown>,
    remap: Map<string, string>,
): Record<string, unknown> => {
    const next = JSON.parse(JSON.stringify(spec)) as Record<string, unknown>;

    const replaceDatumExpression = (expression: string): string => {
        let result = expression;
        remap.forEach((toId, fromId) => {
            result = result
                .split(`datum["${fromId}"]`)
                .join(`datum["${toId}"]`)
                .split(`datum['${fromId}']`)
                .join(`datum['${toId}']`)
                .split(`datum.${fromId}`)
                .join(`datum.${toId}`);
        });
        return result;
    };

    const walk = (value: unknown): void => {
        if (Array.isArray(value)) {
            value.forEach(walk);
            return;
        }
        if (!isRecord(value)) return;

        Object.entries(value).forEach(([key, item]) => {
            if (
                (key === 'field' || key === 'key' || key === 'pivot') &&
                typeof item === 'string'
            ) {
                const trimmed = item.trim();
                const replacement = remap.get(trimmed);
                if (replacement) {
                    value[key] = replacement;
                }
            } else if (
                key === 'value' &&
                typeof item === 'string' &&
                typeof value.pivot === 'string'
            ) {
                const trimmed = item.trim();
                const replacement = remap.get(trimmed);
                if (replacement) {
                    value[key] = replacement;
                }
            } else if (
                (key === 'fields' ||
                    key === 'groupby' ||
                    key === 'row' ||
                    key === 'column') &&
                Array.isArray(item)
            ) {
                item.forEach((fieldName, index) => {
                    if (typeof fieldName !== 'string') return;
                    const trimmed = fieldName.trim();
                    const replacement = remap.get(trimmed);
                    if (replacement) {
                        item[index] = replacement;
                    }
                });
            } else if (
                (key === 'calculate' ||
                    key === 'filter' ||
                    key === 'test' ||
                    key === 'expr') &&
                typeof item === 'string'
            ) {
                value[key] = replaceDatumExpression(item);
            }

            walk(item);
        });
    };

    walk(next);
    return next;
};

/** 探索页：去掉未替换的 {{highlight}} 层，饼图按最细维度 sum 聚合 */
export const sanitizeSpecForExplore = (
    spec: Record<string, unknown>,
    availableFieldIds: Set<string>,
    options?: SanitizeSpecForExploreOptions,
): Record<string, unknown> => {
    const next = JSON.parse(JSON.stringify(spec)) as Record<string, unknown>;

    if (Array.isArray(next.layer)) {
        const layers = next.layer.filter(
            (layer): layer is Record<string, unknown> =>
                isRecord(layer) && !layerUsesMustachePlaceholder(layer),
        );
        next.layer = layers;

        if (layers.length === 1) {
            const onlyLayer = layers[0];
            const markType =
                typeof onlyLayer.mark === 'string'
                    ? onlyLayer.mark
                    : isRecord(onlyLayer.mark)
                      ? onlyLayer.mark.type
                      : null;
            if (markType === 'arc' && isRecord(onlyLayer.encoding)) {
                const flattened = JSON.parse(
                    JSON.stringify(onlyLayer),
                ) as Record<string, unknown>;
                delete next.layer;
                if (flattened.mark) next.mark = flattened.mark;
                if (flattened.encoding) next.encoding = flattened.encoding;
                if (flattened.transform) next.transform = flattened.transform;
            }
        }
    }

    if (!isArcPieSpec(next)) {
        const remap = buildFieldRemap(
            options?.baselineDimensions ?? [],
            options?.baselineMetrics ?? [],
            options?.selectedDimensions ?? [],
            options?.selectedMetrics ?? [],
        );
        if (remap.size > 0) {
            return replaceFieldIdsInSpec(next, remap);
        }
        return next;
    }

    const dimensions =
        options?.selectedDimensions !== undefined
            ? options.selectedDimensions.filter((fieldId) =>
                  availableFieldIds.has(fieldId),
              )
            : [...availableFieldIds].filter((fieldId) =>
                  /(cls_|category|class|类目|品类|品牌|channel|region|biz_period|month|date)/i.test(
                      fieldId,
                  ),
              );
    const metrics =
        options?.selectedMetrics !== undefined
            ? options.selectedMetrics.filter((fieldId) =>
                  availableFieldIds.has(fieldId),
              )
            : [...availableFieldIds].filter(
                  (fieldId) => !dimensions.includes(fieldId),
              );
    const dimensionField = pickPrimaryPieDimension(dimensions);
    const metricField =
        metrics.find((fieldId) =>
            /(amount|sales|gmv|metric|yoy|mom|同比|环比|销售额|金额)/i.test(
                fieldId,
            ),
        ) ||
        metrics[0] ||
        null;
    if (!dimensionField || !metricField) {
        return next;
    }

    if (isRecord(next.encoding)) {
        fixArcEncoding(next.encoding, dimensionField, metricField);
    }
    if (Array.isArray(next.layer)) {
        next.layer.forEach((layer) => {
            if (!isRecord(layer) || !isRecord(layer.encoding)) return;
            const markType =
                typeof layer.mark === 'string'
                    ? layer.mark
                    : isRecord(layer.mark)
                      ? layer.mark.type
                      : null;
            if (markType === 'arc') {
                fixArcEncoding(layer.encoding, dimensionField, metricField);
            }
        });
    }

    return next;
};

export const normalizeSpecToV5 = (
    spec: Record<string, unknown>,
): Record<string, unknown> => {
    const normalized = JSON.parse(JSON.stringify(spec)) as Record<
        string,
        unknown
    >;
    normalized.$schema = V5_SCHEMA;
    if (!isRecord(normalized.data)) {
        normalized.data = { name: 'values' };
    } else {
        delete normalized.data.values;
        delete normalized.data.url;
        normalized.data.name = 'values';
    }
    return normalized;
};

export const validateGeneratedVegaSpec = (
    spec: Record<string, unknown>,
    availableFieldIds: Set<string>,
    options?: SanitizeSpecForExploreOptions,
): {
    normalizedSpec: Record<string, unknown>;
    isValid: boolean;
    errors: string[];
} => {
    const normalizedSpec = sanitizeSpecForExplore(
        normalizeSpecToV5(spec),
        availableFieldIds,
        options,
    );
    const errors: string[] = [];

    if (normalizedSpec.$schema !== V5_SCHEMA) {
        errors.push('Schema 不是 Vega-Lite v5');
    }

    const calculatedFields = collectCalculatedFields(normalizedSpec);
    const pivotInputFields = collectPivotInputFields(normalizedSpec);
    const hasPivotTransform = pivotInputFields.size > 0;
    const refs = collectReferencedFields(normalizedSpec);

    refs.forEach((field) => {
        if (calculatedFields.has(field) || availableFieldIds.has(field)) return;
        if (hasPivotTransform && !pivotInputFields.has(field)) return;
        errors.push(`字段不存在: ${field}`);
    });

    return {
        normalizedSpec,
        isValid: errors.length === 0,
        errors,
    };
};
