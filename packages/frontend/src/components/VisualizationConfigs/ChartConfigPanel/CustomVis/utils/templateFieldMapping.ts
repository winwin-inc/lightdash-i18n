type MappingValue = string | null;
type FieldKind = 'metric' | 'dimension' | 'unknown';

export type CurrentQueryField = {
    fieldId: string;
    label: string;
    aliases?: string[];
    isSelected?: boolean;
    fieldKind?: FieldKind;
};

export type TemplateFieldRef = {
    field: string;
    required: boolean;
    fieldKind: FieldKind;
};

const COMMON_ALIAS_GROUPS = [
    ['date', 'day', 'time', '日期', '时间'],
    ['value', 'amount', 'metric', '值', '指标'],
    ['count', 'cnt', '数量', '个数'],
    ['name', 'title', '名称'],
    ['id', 'uuid', '标识', '编号'],
    ['category', 'type', '类别', '类型'],
];

const normalizeName = (value: string): string =>
    value
        .trim()
        .toLowerCase()
        .replace(/[`"'[\]]/g, '')
        .replace(/[_.\-/:()]+/g, ' ')
        .replace(/\s+/g, ' ');

const toTokenCandidates = (value: string): string[] => {
    const normalized = normalizeName(value);
    const segments = normalized.split(' ').filter(Boolean);
    const lastSegment = segments[segments.length - 1];
    const dotSegment = value.split('.').pop()?.trim().toLowerCase();

    const output = new Set<string>([normalized]);
    if (lastSegment) output.add(lastSegment);
    if (dotSegment) output.add(normalizeName(dotSegment));
    return [...output].filter(Boolean);
};

const extractFieldRefsFromExpression = (expression: string): Set<string> => {
    const refs = new Set<string>();
    const expressionRefDouble = /datum\["([^"]+)"\]/g;
    const expressionRefSingle = /datum\['([^']+)'\]/g;
    const expressionRefDot = /datum\.([a-zA-Z_][a-zA-Z0-9_]*)/g;

    let match: RegExpExecArray | null;
    while ((match = expressionRefDouble.exec(expression)) !== null) {
        refs.add(match[1]);
    }
    while ((match = expressionRefSingle.exec(expression)) !== null) {
        refs.add(match[1]);
    }
    while ((match = expressionRefDot.exec(expression)) !== null) {
        refs.add(match[1]);
    }

    return refs;
};

const collectCalculatedFields = (
    spec: Record<string, unknown>,
): Set<string> => {
    const calculatedFields = new Set<string>();

    const walk = (value: unknown) => {
        if (Array.isArray(value)) {
            value.forEach(walk);
            return;
        }
        if (!value || typeof value !== 'object') return;

        const record = value as Record<string, unknown>;
        if (typeof record.as === 'string' && record.as.trim()) {
            calculatedFields.add(record.as.trim());
        } else if (Array.isArray(record.as)) {
            record.as.forEach((item) => {
                if (typeof item === 'string' && item.trim()) {
                    calculatedFields.add(item.trim());
                }
            });
        }

        Object.values(record).forEach(walk);
    };

    walk(spec);
    return calculatedFields;
};

const collectPivotInputFields = (
    spec: Record<string, unknown>,
): Set<string> => {
    const pivotInputFields = new Set<string>();
    const transforms = Array.isArray(spec.transform) ? spec.transform : [];

    transforms.forEach((transform) => {
        if (!transform || typeof transform !== 'object') return;
        const record = transform as Record<string, unknown>;

        if (typeof record.pivot === 'string' && record.pivot.trim()) {
            pivotInputFields.add(record.pivot.trim());
        }
        if (typeof record.value === 'string' && record.value.trim()) {
            pivotInputFields.add(record.value.trim());
        }
        if (Array.isArray(record.groupby)) {
            record.groupby.forEach((groupByField) => {
                if (typeof groupByField === 'string' && groupByField.trim()) {
                    pivotInputFields.add(groupByField.trim());
                }
            });
        }
    });

    return pivotInputFields;
};

const shouldTreatValueAsField = (record: Record<string, unknown>): boolean => {
    // 仅在 pivot transform 中把 `value` 视为字段名，避免把颜色/常量 value 误当成字段
    return typeof record.pivot === 'string';
};

const toFieldKindByEncodingType = (encodingType: unknown): FieldKind => {
    if (encodingType === 'quantitative') return 'metric';
    if (
        encodingType === 'nominal' ||
        encodingType === 'ordinal' ||
        encodingType === 'temporal'
    ) {
        return 'dimension';
    }
    return 'unknown';
};

const chooseKind = (a: FieldKind, b: FieldKind): FieldKind => {
    if (a === b) return a;
    if (a === 'unknown') return b;
    if (b === 'unknown') return a;
    return a;
};

export const extractTemplateFieldRefs = (
    spec: Record<string, unknown> | null | undefined,
): TemplateFieldRef[] => {
    if (!spec) return [];

    const refs = new Map<string, TemplateFieldRef>();
    const calculatedFields = collectCalculatedFields(spec);
    const pivotInputFields = collectPivotInputFields(spec);
    const hasPivotTransform = pivotInputFields.size > 0;

    const upsertRef = (
        field: string,
        required: boolean,
        fieldKind: FieldKind = 'unknown',
    ) => {
        const trimmed = field.trim();
        if (!trimmed || calculatedFields.has(trimmed)) return;
        if (hasPivotTransform && !pivotInputFields.has(trimmed)) return;

        const existing = refs.get(trimmed);
        if (!existing) {
            refs.set(trimmed, {
                field: trimmed,
                required,
                fieldKind,
            });
            return;
        }

        refs.set(trimmed, {
            field: trimmed,
            required: existing.required || required,
            fieldKind: chooseKind(existing.fieldKind, fieldKind),
        });
    };

    const walk = (
        value: unknown,
        context?: {
            inTooltip?: boolean;
            inTextEncoding?: boolean;
            inTextMarkLayer?: boolean;
            encodingType?: unknown;
        },
    ) => {
        if (Array.isArray(value)) {
            value.forEach((item) => walk(item, context));
            return;
        }
        if (!value || typeof value !== 'object') return;

        const record = value as Record<string, unknown>;
        const markType =
            typeof record.mark === 'object' && record.mark !== null
                ? (record.mark as Record<string, unknown>).type
                : typeof record.mark === 'string'
                  ? record.mark
                  : undefined;

        Object.entries(record).forEach(([key, item]) => {
            const nextContext = {
                inTooltip: context?.inTooltip || key === 'tooltip',
                inTextEncoding: context?.inTextEncoding || key === 'text',
                inTextMarkLayer:
                    context?.inTextMarkLayer || markType === 'text',
                encodingType: key === 'type' ? item : context?.encodingType,
            };

            const isOptional = !!(
                nextContext.inTooltip ||
                nextContext.inTextEncoding ||
                nextContext.inTextMarkLayer
            );
            const fieldKind = toFieldKindByEncodingType(
                nextContext.encodingType,
            );

            if (
                (key === 'field' || key === 'key' || key === 'pivot') &&
                typeof item === 'string'
            ) {
                const required = key === 'pivot' ? true : !isOptional;
                upsertRef(
                    item,
                    required,
                    key === 'pivot' ? 'dimension' : fieldKind,
                );
            } else if (
                key === 'value' &&
                typeof item === 'string' &&
                shouldTreatValueAsField(record)
            ) {
                upsertRef(item, true, 'metric');
            } else if (
                (key === 'fields' ||
                    key === 'groupby' ||
                    key === 'row' ||
                    key === 'column' ||
                    key === 'layer') &&
                Array.isArray(item)
            ) {
                item.forEach((arrayItem) => {
                    if (typeof arrayItem === 'string') {
                        const kind =
                            key === 'groupby' ? 'dimension' : fieldKind;
                        const required = key === 'groupby' ? true : !isOptional;
                        upsertRef(arrayItem, required, kind);
                    }
                });
            } else if (
                (key === 'calculate' ||
                    key === 'filter' ||
                    key === 'test' ||
                    key === 'expr') &&
                typeof item === 'string'
            ) {
                extractFieldRefsFromExpression(item).forEach((fieldRef) => {
                    upsertRef(fieldRef, !isOptional, 'unknown');
                });
            }

            walk(item, nextContext);
        });
    };

    walk(spec);

    return [...refs.values()].sort((a, b) => a.field.localeCompare(b.field));
};

export const extractTemplateFields = (
    spec: Record<string, unknown> | null | undefined,
): string[] => extractTemplateFieldRefs(spec).map((ref) => ref.field);

const getAliasTokens = (value: string): Set<string> => {
    const output = new Set<string>(toTokenCandidates(value));

    COMMON_ALIAS_GROUPS.forEach((group) => {
        const normalizedGroup = group.map((item) => normalizeName(item));
        const intersects = normalizedGroup.some((alias) => output.has(alias));
        if (intersects) {
            normalizedGroup.forEach((alias) => output.add(alias));
        }
    });

    return output;
};

const getFieldTokens = (field: CurrentQueryField): Set<string> => {
    const tokens = new Set<string>(toTokenCandidates(field.fieldId));
    toTokenCandidates(field.label).forEach((token) => tokens.add(token));
    (field.aliases || []).forEach((alias) => {
        toTokenCandidates(alias).forEach((token) => tokens.add(token));
    });
    return tokens;
};

export const buildDefaultMappings = (
    templateFields: string[] | TemplateFieldRef[],
    currentFields: CurrentQueryField[],
): Record<string, MappingValue> => {
    const mappings: Record<string, MappingValue> = {};

    templateFields.forEach((templateFieldRef) => {
        const templateField =
            typeof templateFieldRef === 'string'
                ? templateFieldRef
                : templateFieldRef.field;
        const expectedKind =
            typeof templateFieldRef === 'string'
                ? 'unknown'
                : templateFieldRef.fieldKind;

        const rankByExpectedKind = (field: CurrentQueryField): number => {
            if (expectedKind === 'unknown') return 0;
            if (field.fieldKind === expectedKind) return 0;
            if (!field.fieldKind || field.fieldKind === 'unknown') return 1;
            return 2;
        };

        const templateTokens = getAliasTokens(templateField);
        const normalizedTemplate = normalizeName(templateField);
        const [primaryTemplateToken] = [...templateTokens];

        const exactMatch = [...currentFields]
            .sort((a, b) => rankByExpectedKind(a) - rankByExpectedKind(b))
            .find((field) => getFieldTokens(field).has(normalizedTemplate));

        if (exactMatch) {
            mappings[templateField] = exactMatch.fieldId;
            return;
        }

        const suffixMatch = [...currentFields]
            .sort((a, b) => rankByExpectedKind(a) - rankByExpectedKind(b))
            .find((field) => {
                const normalizedFieldId = normalizeName(field.fieldId);
                return (
                    normalizedFieldId.endsWith(` ${normalizedTemplate}`) ||
                    normalizedFieldId.endsWith(normalizedTemplate)
                );
            });

        if (suffixMatch) {
            mappings[templateField] = suffixMatch.fieldId;
            return;
        }

        if (!primaryTemplateToken) {
            mappings[templateField] = null;
            return;
        }

        const aliasMatch = [...currentFields]
            .sort((a, b) => rankByExpectedKind(a) - rankByExpectedKind(b))
            .find((field) => {
                const fieldTokens = getFieldTokens(field);
                return [...templateTokens].some((token) =>
                    fieldTokens.has(token),
                );
            });

        mappings[templateField] = aliasMatch?.fieldId ?? null;
    });

    return mappings;
};

const hasFieldRefInEncodingValue = (
    value: unknown,
    fieldNames: Set<string>,
): boolean => {
    if (Array.isArray(value)) {
        return value.some((item) =>
            hasFieldRefInEncodingValue(item, fieldNames),
        );
    }
    if (!value || typeof value !== 'object') return false;

    const record = value as Record<string, unknown>;
    if (
        (typeof record.field === 'string' && fieldNames.has(record.field)) ||
        (typeof record.key === 'string' && fieldNames.has(record.key)) ||
        (typeof record.pivot === 'string' && fieldNames.has(record.pivot)) ||
        (typeof record.value === 'string' &&
            fieldNames.has(record.value) &&
            shouldTreatValueAsField(record))
    ) {
        return true;
    }

    if (typeof record.calculate === 'string') {
        const refs = extractFieldRefsFromExpression(record.calculate);
        if ([...refs].some((field) => fieldNames.has(field))) return true;
    }
    if (typeof record.filter === 'string') {
        const refs = extractFieldRefsFromExpression(record.filter);
        if ([...refs].some((field) => fieldNames.has(field))) return true;
    }
    if (typeof record.test === 'string') {
        const refs = extractFieldRefsFromExpression(record.test);
        if ([...refs].some((field) => fieldNames.has(field))) return true;
    }
    if (typeof record.expr === 'string') {
        const refs = extractFieldRefsFromExpression(record.expr);
        if ([...refs].some((field) => fieldNames.has(field))) return true;
    }

    return Object.values(record).some((item) =>
        hasFieldRefInEncodingValue(item, fieldNames),
    );
};

const stripUnmappedOptionalRefs = (
    spec: Record<string, unknown>,
    unresolvedOptionalFields: string[],
): Record<string, unknown> => {
    if (unresolvedOptionalFields.length === 0) return spec;
    const optionalSet = new Set(unresolvedOptionalFields);

    const walk = (value: unknown): unknown => {
        if (Array.isArray(value)) {
            return value
                .map((item) => walk(item))
                .filter((item) => item !== undefined);
        }
        if (!value || typeof value !== 'object') return value;

        const record = value as Record<string, unknown>;
        const next: Record<string, unknown> = {};

        if (Array.isArray(record.layer)) {
            const filteredLayers = record.layer
                .map((layerItem) => walk(layerItem))
                .filter((layerItem) => {
                    if (!layerItem || typeof layerItem !== 'object')
                        return false;
                    const layer = layerItem as Record<string, unknown>;
                    const mark =
                        typeof layer.mark === 'object' && layer.mark !== null
                            ? (layer.mark as Record<string, unknown>).type
                            : layer.mark;
                    if (mark !== 'text') return true;
                    return !hasFieldRefInEncodingValue(layer, optionalSet);
                });
            next.layer = filteredLayers;
        }

        Object.entries(record).forEach(([key, item]) => {
            if (key === 'layer') return;

            if (key === 'tooltip') {
                if (Array.isArray(item)) {
                    const filtered = item.filter((tooltipItem) => {
                        if (
                            !tooltipItem ||
                            typeof tooltipItem !== 'object' ||
                            Array.isArray(tooltipItem)
                        )
                            return true;
                        const field = (tooltipItem as Record<string, unknown>)
                            .field;
                        return !(
                            typeof field === 'string' && optionalSet.has(field)
                        );
                    });
                    if (filtered.length > 0) next[key] = filtered;
                    return;
                }
                if (
                    item &&
                    typeof item === 'object' &&
                    !Array.isArray(item) &&
                    typeof (item as Record<string, unknown>).field ===
                        'string' &&
                    optionalSet.has(
                        (item as Record<string, unknown>).field as string,
                    )
                ) {
                    return;
                }
                next[key] = walk(item);
                return;
            }

            if (
                key === 'text' &&
                item &&
                typeof item === 'object' &&
                !Array.isArray(item) &&
                typeof (item as Record<string, unknown>).field === 'string' &&
                optionalSet.has(
                    (item as Record<string, unknown>).field as string,
                )
            ) {
                return;
            }

            if (
                key === 'sort' &&
                item &&
                typeof item === 'object' &&
                !Array.isArray(item) &&
                typeof (item as Record<string, unknown>).field === 'string' &&
                optionalSet.has(
                    (item as Record<string, unknown>).field as string,
                )
            ) {
                return;
            }

            next[key] = walk(item);
        });

        return next;
    };

    return walk(spec) as Record<string, unknown>;
};

const rewriteExpressionWithMappings = (
    expression: string,
    mappings: Record<string, string>,
): string => {
    let output = expression;
    Object.entries(mappings).forEach(([fromField, toField]) => {
        const escaped = fromField.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        output = output.replace(
            new RegExp(`datum\\["${escaped}"\\]`, 'g'),
            `datum["${toField}"]`,
        );
        output = output.replace(
            new RegExp(`datum\\['${escaped}'\\]`, 'g'),
            `datum['${toField}']`,
        );
        if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(fromField)) {
            output = output.replace(
                new RegExp(`datum\\.${escaped}\\b`, 'g'),
                `datum.${toField}`,
            );
        }
    });
    return output;
};

export const applyMappingsToSpec = (
    spec: Record<string, unknown>,
    mappings: Record<string, MappingValue>,
    options?: {
        unresolvedOptionalFields?: string[];
    },
): Record<string, unknown> => {
    const specToApply = stripUnmappedOptionalRefs(
        spec,
        options?.unresolvedOptionalFields ?? [],
    );
    const validMappings: Record<string, string> = Object.fromEntries(
        Object.entries(mappings).filter(
            (entry): entry is [string, string] =>
                typeof entry[1] === 'string' && !!entry[1],
        ),
    );

    const walk = (value: unknown): unknown => {
        if (Array.isArray(value)) {
            return value.map(walk);
        }
        if (!value || typeof value !== 'object') return value;

        const record = value as Record<string, unknown>;
        const next: Record<string, unknown> = {};

        Object.entries(record).forEach(([key, item]) => {
            if (key === 'as') {
                next[key] = item;
                return;
            }

            if (
                (key === 'field' || key === 'key' || key === 'pivot') &&
                typeof item === 'string'
            ) {
                next[key] = validMappings[item] ?? item;
                return;
            }

            if (
                key === 'value' &&
                typeof item === 'string' &&
                shouldTreatValueAsField(record)
            ) {
                next[key] = validMappings[item] ?? item;
                return;
            }

            if (
                (key === 'fields' ||
                    key === 'groupby' ||
                    key === 'row' ||
                    key === 'column' ||
                    key === 'layer') &&
                Array.isArray(item)
            ) {
                next[key] = item.map((fieldName) =>
                    typeof fieldName === 'string'
                        ? (validMappings[fieldName] ?? fieldName)
                        : walk(fieldName),
                );
                return;
            }

            if (
                (key === 'calculate' ||
                    key === 'filter' ||
                    key === 'test' ||
                    key === 'expr') &&
                typeof item === 'string'
            ) {
                next[key] = rewriteExpressionWithMappings(item, validMappings);
                return;
            }

            next[key] = walk(item);
        });

        return next;
    };

    return walk(specToApply) as Record<string, unknown>;
};
