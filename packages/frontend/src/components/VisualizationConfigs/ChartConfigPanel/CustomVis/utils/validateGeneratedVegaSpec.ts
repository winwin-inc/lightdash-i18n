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
): {
    normalizedSpec: Record<string, unknown>;
    isValid: boolean;
    errors: string[];
} => {
    const normalizedSpec = normalizeSpecToV5(spec);
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
