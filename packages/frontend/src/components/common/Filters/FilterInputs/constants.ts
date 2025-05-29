import { FilterOperator } from '@lightdash/common';
import { useTranslation } from 'react-i18next';

export const useFilterOperatorLabel = () => {
    const { t } = useTranslation();

    const filterOperatorLabel = {
        [FilterOperator.NULL]: t(
            'components_common_filters_inputs.filter_operator_labels.is_null',
        ),
        [FilterOperator.NOT_NULL]: t(
            'components_common_filters_inputs.filter_operator_labels.is_not_null',
        ),
        [FilterOperator.EQUALS]: t(
            'components_common_filters_inputs.filter_operator_labels.is',
        ),
        [FilterOperator.NOT_EQUALS]: t(
            'components_common_filters_inputs.filter_operator_labels.is_not',
        ),
        [FilterOperator.STARTS_WITH]: t(
            'components_common_filters_inputs.filter_operator_labels.starts_with',
        ),
        [FilterOperator.ENDS_WITH]: t(
            'components_common_filters_inputs.filter_operator_labels.ends_with',
        ),
        [FilterOperator.NOT_INCLUDE]: t(
            'components_common_filters_inputs.filter_operator_labels.does_not_include',
        ),
        [FilterOperator.INCLUDE]: t(
            'components_common_filters_inputs.filter_operator_labels.includes',
        ),
        [FilterOperator.LESS_THAN]: t(
            'components_common_filters_inputs.filter_operator_labels.is_less_than',
        ),
        [FilterOperator.LESS_THAN_OR_EQUAL]: t(
            'components_common_filters_inputs.filter_operator_labels.is_less_than_or_equal',
        ),
        [FilterOperator.GREATER_THAN]: t(
            'components_common_filters_inputs.filter_operator_labels.is_greater_than',
        ),
        [FilterOperator.GREATER_THAN_OR_EQUAL]: t(
            'components_common_filters_inputs.filter_operator_labels.is_greater_than_or_equal',
        ),
        [FilterOperator.IN_THE_PAST]: t(
            'components_common_filters_inputs.filter_operator_labels.is_the_last',
        ),
        [FilterOperator.NOT_IN_THE_PAST]: t(
            'components_common_filters_inputs.filter_operator_labels.not_in_the_last',
        ),
        [FilterOperator.IN_THE_NEXT]: t(
            'components_common_filters_inputs.filter_operator_labels.in_the_next',
        ),
        [FilterOperator.IN_THE_CURRENT]: t(
            'components_common_filters_inputs.filter_operator_labels.in_the_current',
        ),
        [FilterOperator.NOT_IN_THE_CURRENT]: t(
            'components_common_filters_inputs.filter_operator_labels.not_in_the_current',
        ),
        [FilterOperator.IN_BETWEEN]: t(
            'components_common_filters_inputs.filter_operator_labels.is_between',
        ),
        [FilterOperator.NOT_IN_BETWEEN]: t(
            'components_common_filters_inputs.filter_operator_labels.is_not_between',
        ),
    } as Record<FilterOperator, string>;

    const getFilterOptions = <T extends FilterOperator>(
        operators: Array<T>,
    ): Array<{ value: T; label: string }> =>
        operators.map((operator) => ({
            value: operator,
            label: filterOperatorLabel[operator],
        }));

    return {
        filterOperatorLabel,
        getFilterOptions,
    };
};
