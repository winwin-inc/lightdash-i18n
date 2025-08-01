import { assertUnreachable, SearchItemType } from '@lightdash/common';
import { useTranslation } from 'react-i18next';

export const useSearchItemLabel = () => {
    const { t } = useTranslation();

    return (itemType: SearchItemType) => {
        switch (itemType) {
            case SearchItemType.FIELD:
                return t('features_omnibar_labels.items.field');
            case SearchItemType.DASHBOARD:
                return t('features_omnibar_labels.items.dashboard');
            case SearchItemType.DASHBOARD_TAB:
                return t('features_omnibar_labels.items.dashboard_tab');
            case SearchItemType.CHART:
                return t('features_omnibar_labels.items.chart');
            case SearchItemType.SPACE:
                return t('features_omnibar_labels.items.space');
            case SearchItemType.TABLE:
                return t('features_omnibar_labels.items.table');
            case SearchItemType.PAGE:
                return t('features_omnibar_labels.items.page');
            case SearchItemType.SQL_CHART:
                return t('features_omnibar_labels.items.sql_chart');
            default:
                return assertUnreachable(
                    itemType as never,
                    `Unknown search item type: ${itemType}`,
                );
        }
    };
};

export const useSearchItemErrorLabel = () => {
    const { t } = useTranslation();

    return (itemType: SearchItemType) => {
        switch (itemType) {
            case SearchItemType.FIELD:
                return t('features_omnibar_labels.errors.field');
            case SearchItemType.DASHBOARD:
                return t('features_omnibar_labels.errors.dashboard');
            case SearchItemType.DASHBOARD_TAB:
                return t('features_omnibar_labels.errors.dashboard_tab');
            case SearchItemType.CHART:
                return t('features_omnibar_labels.errors.chart');
            case SearchItemType.SPACE:
            case SearchItemType.TABLE:
            case SearchItemType.PAGE:
            default:
                return new Error(`Unknown error item type: ${itemType}`);
        }
    };
};
