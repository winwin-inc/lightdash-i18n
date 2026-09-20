import {
    DimensionType,
    MetricType,
    TableCalculationType,
    assertUnreachable,
    getItemType,
    isDimension,
    isField,
    isMetric,
    type CustomDimension,
    type Field,
    type SortField,
    type TableCalculation,
} from '@lightdash/common';
import {
    IconSortAscendingLetters,
    IconSortAscendingNumbers,
    IconSortDescendingLetters,
    IconSortDescendingNumbers,
} from '@tabler/icons-react';

export enum SortDirection {
    ASC = 'ASC',
    DESC = 'DESC',
}

export const getSortDirectionOrder = (
    item: Field | TableCalculation | CustomDimension,
) => {
    if (!isField(item)) {
        return [SortDirection.ASC, SortDirection.DESC];
    }
    switch (item.type) {
        case DimensionType.BOOLEAN:
        case MetricType.BOOLEAN:
            return [SortDirection.DESC, SortDirection.ASC];
        default:
            return [SortDirection.ASC, SortDirection.DESC];
    }
};

export enum SortNullsFirst {
    DEFAULT = 'DEFAULT',
    FIRST = 'FIRST',
    LAST = 'LAST',
}

export const getSortNullsFirstValue = (sort: SortField) => {
    if (sort.nullsFirst === undefined) return SortNullsFirst.DEFAULT;
    return sort.nullsFirst ? SortNullsFirst.FIRST : SortNullsFirst.LAST;
};

export const sortNullsFirstLabels = {
    [SortNullsFirst.DEFAULT]: 'components_sort_button.nulls_options.default',
    [SortNullsFirst.FIRST]: 'components_sort_button.nulls_options.first',
    [SortNullsFirst.LAST]: 'components_sort_button.nulls_options.last',
} as const;

enum NumericSortLabels {
    ASC = '1-9',
    DESC = '9-1',
}

enum StringSortLabels {
    ASC = 'A-Z',
    DESC = 'Z-A',
}

type TranslateFn = (key: string) => string;

export const getSortLabel = (
    item: Field | TableCalculation | CustomDimension,
    direction: SortDirection,
    t: TranslateFn,
) => {
    const type = getItemType(item);
    switch (type) {
        case DimensionType.NUMBER:
        case MetricType.PERCENTILE:
        case MetricType.MEDIAN:
        case MetricType.AVERAGE:
        case MetricType.COUNT:
        case MetricType.COUNT_DISTINCT:
        case MetricType.SUM:
        case MetricType.MIN:
        case MetricType.MAX:
        case MetricType.NUMBER:
        case MetricType.PERCENT_OF_PREVIOUS:
        case MetricType.PERCENT_OF_TOTAL:
        case MetricType.RUNNING_TOTAL:
        case TableCalculationType.NUMBER:
            return direction === SortDirection.ASC
                ? NumericSortLabels.ASC
                : NumericSortLabels.DESC;
        case DimensionType.STRING:
        case MetricType.STRING:
        case TableCalculationType.STRING:
            return direction === SortDirection.ASC
                ? StringSortLabels.ASC
                : StringSortLabels.DESC;
        case DimensionType.TIMESTAMP:
        case DimensionType.DATE:
        case MetricType.DATE:
        case MetricType.TIMESTAMP:
        case TableCalculationType.TIMESTAMP:
        case TableCalculationType.DATE:
            return direction === SortDirection.ASC
                ? t('components_sort_button.sort_labels.old_new')
                : t('components_sort_button.sort_labels.new_old');
        case DimensionType.BOOLEAN:
        case MetricType.BOOLEAN:
        case TableCalculationType.BOOLEAN:
            return direction === SortDirection.ASC
                ? t('components_sort_button.sort_labels.false_true')
                : t('components_sort_button.sort_labels.true_false');
        default:
            return assertUnreachable(
                type,
                'Unexpected type when getting sort label',
            );
    }
};

export const getSortIcon = (
    item: Field | TableCalculation | CustomDimension,
    descending: boolean,
) => {
    if (!isField(item)) {
        return descending
            ? IconSortDescendingLetters
            : IconSortAscendingLetters;
    }

    if (isDimension(item) || isMetric(item)) {
        switch (item.type) {
            case DimensionType.STRING:
            case MetricType.STRING:
            case DimensionType.BOOLEAN:
            case MetricType.BOOLEAN:
                return descending
                    ? IconSortDescendingLetters
                    : IconSortAscendingLetters;
            default:
                // Numbers, dates and times
                return descending
                    ? IconSortDescendingNumbers
                    : IconSortAscendingNumbers;
        }
    }
    return descending ? IconSortDescendingLetters : IconSortAscendingLetters;
};
