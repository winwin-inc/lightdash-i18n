import { DimensionType, MetricType } from '@lightdash/common';
import { useTranslation } from 'react-i18next';

export const useTableMetricTypeLabels = (): Record<MetricType, string> => {
    const { t } = useTranslation();

    return {
        [MetricType.COUNT_DISTINCT]: t(
            'components_explorer_table_metric_type_labels.count_distinct',
        ),
        [MetricType.COUNT]: t(
            'components_explorer_table_metric_type_labels.count',
        ),
        [MetricType.MIN]: t('components_explorer_table_metric_type_labels.min'),
        [MetricType.MAX]: t('components_explorer_table_metric_type_labels.max'),
        [MetricType.SUM]: t('components_explorer_table_metric_type_labels.sum'),
        [MetricType.PERCENTILE]: t(
            'components_explorer_table_metric_type_labels.percentile',
        ),
        [MetricType.MEDIAN]: t(
            'components_explorer_table_metric_type_labels.median',
        ),
        [MetricType.AVERAGE]: t(
            'components_explorer_table_metric_type_labels.average',
        ),
        [MetricType.STRING]: t(
            'components_explorer_table_metric_type_labels.string',
        ),
        [MetricType.DATE]: t(
            'components_explorer_table_metric_type_labels.date',
        ),
        [MetricType.TIMESTAMP]: t(
            'components_explorer_table_metric_type_labels.timestamp',
        ),
        [MetricType.BOOLEAN]: t(
            'components_explorer_table_metric_type_labels.boolean',
        ),
        [MetricType.NUMBER]: t(
            'components_explorer_table_metric_type_labels.number',
        ),
    };
};
