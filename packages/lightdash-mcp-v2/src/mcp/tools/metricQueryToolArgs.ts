import { QueryExecutionContext } from '@lightdash/common';

export function toObjectLike(
    value: unknown,
    fieldName: string,
): Record<string, unknown> | undefined {
    const raw =
        typeof value === 'string'
            ? ((): unknown => {
                  try {
                      return JSON.parse(value) as unknown;
                  } catch {
                      return value;
                  }
              })()
            : value;
    if (raw === undefined || raw === null) return undefined;
    if (typeof raw === 'object' && !Array.isArray(raw)) {
        return raw as Record<string, unknown>;
    }
    throw new Error(
        `${fieldName} must be an object (or a JSON object string)`,
    );
}

export function toArrayLike(value: unknown, fieldName: string): unknown[] | undefined {
    const raw =
        typeof value === 'string'
            ? ((): unknown => {
                  try {
                      return JSON.parse(value) as unknown;
                  } catch {
                      return value;
                  }
              })()
            : value;
    if (raw === undefined || raw === null) return undefined;
    if (Array.isArray(raw)) return raw;
    throw new Error(
        `${fieldName} must be an array (or a JSON array string)`,
    );
}

export function toOptionalQueryContext(
    value: unknown,
): QueryExecutionContext | undefined {
    if (value === undefined || value === null) return undefined;
    if (typeof value !== 'string' || value.trim().length === 0) {
        return undefined;
    }
    const context = value.trim();
    const allowed = new Set<string>(Object.values(QueryExecutionContext));
    if (!allowed.has(context)) {
        return QueryExecutionContext.MCP;
    }
    return context as QueryExecutionContext;
}

export function toStringArray(value: unknown): string[] {
    const raw =
        typeof value === 'string'
            ? ((): unknown => {
                  try {
                      return JSON.parse(value) as unknown;
                  } catch {
                      return value;
                  }
              })()
            : value;
    if (!Array.isArray(raw)) {
        if (typeof raw === 'string' && raw.length > 0) return [raw];
        return [];
    }
    return raw.filter((item): item is string => typeof item === 'string');
}

/** dimensions/metrics from queryConfig/metricQuery blocks (must not call .filter on non-arrays). */
export function toMetricQueryFieldIds(value: unknown): string[] {
    if (value === undefined || value === null) return [];
    return toStringArray(value);
}

export function toArray(value: unknown): unknown[] {
    const raw =
        typeof value === 'string'
            ? ((): unknown => {
                  try {
                      return JSON.parse(value) as unknown;
                  } catch {
                      return value;
                  }
              })()
            : value;
    return Array.isArray(raw) ? raw : [];
}

export function toSorts(
    value: unknown,
    resolveFieldId: (field: string) => string,
): unknown[] {
    const raw = toArray(value);
    return raw
        .map((item) => {
            if (!item || typeof item !== 'object') return null;
            const obj = item as {
                fieldId?: unknown;
                columnId?: unknown;
                descending?: unknown;
                order?: unknown;
                orientation?: unknown;
            };
            const fieldId =
                typeof obj.fieldId === 'string'
                    ? obj.fieldId
                    : typeof obj.columnId === 'string'
                      ? obj.columnId
                      : undefined;
            if (!fieldId) return null;

            const descending =
                typeof obj.descending === 'boolean'
                    ? obj.descending
                    : typeof obj.order === 'string'
                      ? obj.order.toLowerCase() === 'desc'
                      : typeof obj.orientation === 'string'
                        ? obj.orientation.toLowerCase() === 'desc'
                        : false;

            return { fieldId: resolveFieldId(fieldId), descending };
        })
        .filter((x): x is { fieldId: string; descending: boolean } => x !== null);
}

function normalizeFilterRule(
    candidate: unknown,
    resolveFieldId: (field: string) => string,
    fallbackFieldId?: string,
): Record<string, unknown> | null {
    if (!candidate || typeof candidate !== 'object') return null;
    const src = candidate as {
        id?: unknown;
        target?: unknown;
        operator?: unknown;
        values?: unknown;
        fieldId?: unknown;
    };
    const target =
        src.target && typeof src.target === 'object'
            ? (src.target as Record<string, unknown>)
            : undefined;
    const targetFieldId =
        target && typeof target.fieldId === 'string'
            ? target.fieldId
            : typeof src.fieldId === 'string'
              ? src.fieldId
              : fallbackFieldId;
    if (!targetFieldId) return null;

    const operator =
        typeof src.operator === 'string' && src.operator.length > 0
            ? src.operator
            : 'equals';
    const values = Array.isArray(src.values) ? src.values : [];

    return {
        id:
            typeof src.id === 'string' && src.id.length > 0
                ? src.id
                : `${targetFieldId}-${operator}`,
        target: { fieldId: resolveFieldId(targetFieldId) },
        operator,
        values,
    };
}

export function toFilters(
    value: unknown,
    resolveFieldId: (field: string) => string,
): Record<string, unknown> {
    const raw =
        typeof value === 'string'
            ? ((): unknown => {
                  try {
                      return JSON.parse(value) as unknown;
                  } catch {
                      return value;
                  }
              })()
            : value;
    if (!raw) return {};

    if (
        typeof raw === 'object' &&
        !Array.isArray(raw) &&
        raw !== null &&
        ('dimensions' in raw || 'metrics' in raw || 'tableCalculations' in raw)
    ) {
        return raw as Record<string, unknown>;
    }

    if (Array.isArray(raw)) {
        const rules = raw
            .map((rule) => normalizeFilterRule(rule, resolveFieldId))
            .filter((r): r is Record<string, unknown> => r !== null);
        return rules.length > 0 ? { dimensions: rules } : {};
    }

    if (typeof raw === 'object' && raw !== null) {
        const rules = Object.entries(raw as Record<string, unknown>)
            .map(([fieldId, rule]) =>
                normalizeFilterRule(rule, resolveFieldId, fieldId),
            )
            .filter((r): r is Record<string, unknown> => r !== null);
        return rules.length > 0 ? { dimensions: rules } : {};
    }

    return {};
}
