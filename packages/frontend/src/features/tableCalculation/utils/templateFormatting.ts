import {
    assertUnreachable,
    TableCalculationTemplateType,
} from '@lightdash/common';
import { useTranslation } from 'react-i18next';


export const useTemplateTypeLabels = (): Record<TableCalculationTemplateType, string> => {
    const { t } = useTranslation();

    return {
        [TableCalculationTemplateType.PERCENT_CHANGE_FROM_PREVIOUS]:
            t('components_explorer_results_card_quick_calculations.type_labels.percent_change_from_previous'),
        [TableCalculationTemplateType.PERCENT_OF_PREVIOUS_VALUE]:
            t('components_explorer_results_card_quick_calculations.type_labels.percent_of_previous_value'),
        [TableCalculationTemplateType.PERCENT_OF_COLUMN_TOTAL]:
            t('components_explorer_results_card_quick_calculations.type_labels.percent_of_column_total'),
        [TableCalculationTemplateType.RANK_IN_COLUMN]: t('components_explorer_results_card_quick_calculations.type_labels.rank_in_column'),
        [TableCalculationTemplateType.RUNNING_TOTAL]: t('components_explorer_results_card_quick_calculations.type_labels.running_total'),
    };
}

export const useFormatTemplateType = (): (type: TableCalculationTemplateType) => string => {
    const templateTypeLabels = useTemplateTypeLabels();
    return (type: TableCalculationTemplateType) => templateTypeLabels[type];
};

export const useGetTemplateDescription = (): (type: TableCalculationTemplateType) => string => {
    const { t } = useTranslation();

    return (type: TableCalculationTemplateType) => {
        switch (type) {
            case TableCalculationTemplateType.PERCENT_CHANGE_FROM_PREVIOUS:
                return t('components_explorer_results_card_quick_calculations.type_descriptions.percent_change_from_previous');
            case TableCalculationTemplateType.PERCENT_OF_PREVIOUS_VALUE:
                return t('components_explorer_results_card_quick_calculations.type_descriptions.percent_of_previous_value');
            case TableCalculationTemplateType.PERCENT_OF_COLUMN_TOTAL:
                return t('components_explorer_results_card_quick_calculations.type_descriptions.percent_of_column_total');
            case TableCalculationTemplateType.RANK_IN_COLUMN:
                return t('components_explorer_results_card_quick_calculations.type_descriptions.rank_in_column');
            case TableCalculationTemplateType.RUNNING_TOTAL:
                return t('components_explorer_results_card_quick_calculations.type_descriptions.running_total');
            default:
                return assertUnreachable(type, t('components_explorer_results_card_quick_calculations.type_descriptions.unknown'));
        }
    }
}