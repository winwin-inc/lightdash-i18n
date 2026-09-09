import type { FunctionDefinition } from '@lightdash/formula';
import { type TFunction } from 'i18next';

export type FunctionCategory = FunctionDefinition['category'];

export const CATEGORY_LABEL_KEYS: Record<FunctionCategory, string> = {
    aggregate: 'features_table_calculation_formula.categories.aggregate',
    logical: 'features_table_calculation_formula.categories.logical',
    math: 'features_table_calculation_formula.categories.math',
    string: 'features_table_calculation_formula.categories.string',
    date: 'features_table_calculation_formula.categories.date',
    window: 'features_table_calculation_formula.categories.window',
    null: 'features_table_calculation_formula.categories.null',
    type: 'features_table_calculation_formula.categories.type',
};

/** @deprecated Prefer getCategoryLabels(t) for i18n */
export const CATEGORY_LABELS: Record<FunctionCategory, string> = {
    aggregate: 'Aggregate',
    logical: 'Logic',
    math: 'Math',
    string: 'Text',
    date: 'Date',
    window: 'Window',
    null: 'Null handling',
    type: 'Type',
};

export const getCategoryLabels = (
    t: TFunction,
): Record<FunctionCategory, string> => ({
    aggregate: t(CATEGORY_LABEL_KEYS.aggregate),
    logical: t(CATEGORY_LABEL_KEYS.logical),
    math: t(CATEGORY_LABEL_KEYS.math),
    string: t(CATEGORY_LABEL_KEYS.string),
    date: t(CATEGORY_LABEL_KEYS.date),
    window: t(CATEGORY_LABEL_KEYS.window),
    null: t(CATEGORY_LABEL_KEYS.null),
    type: t(CATEGORY_LABEL_KEYS.type),
});

export const CATEGORY_ORDER: FunctionCategory[] = [
    'aggregate',
    'logical',
    'math',
    'string',
    'date',
    'window',
    'null',
    'type',
];
