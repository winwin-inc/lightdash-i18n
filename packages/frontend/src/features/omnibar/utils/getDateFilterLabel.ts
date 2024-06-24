import { type SearchFilters } from '@lightdash/common';
import dayjs from 'dayjs';
import { useTranslation } from 'react-i18next';

export function useDateFilterLabel() {
    const { t } = useTranslation();

    return (filters: SearchFilters = {}) => {
        const { fromDate, toDate } = filters;
        const fromDateObj = fromDate ? dayjs(fromDate) : undefined;
        const toDateObj = toDate ? dayjs(toDate) : undefined;
        const dateFmt = 'YYYY-MM-DD';

        if (fromDateObj && !toDateObj) {
            return `${t(
                'features_omnibar_labels.date.from',
            )} ${fromDateObj.format(dateFmt)}`;
        }

        if (!fromDateObj && toDateObj) {
            return `${t('features_omnibar_labels.date.to')} ${toDateObj.format(
                dateFmt,
            )}`;
        }

        if (fromDateObj?.isSame(toDateObj, 'day')) {
            return fromDateObj?.format(dateFmt);
        }

        if (fromDateObj && toDateObj) {
            return `${t(
                'features_omnibar_labels.date.from',
            )} ${fromDateObj.format(dateFmt)} ${t(
                'features_omnibar_labels.date.to',
            )} ${toDateObj.format(dateFmt)}`;
        }

        return t('features_omnibar_labels.date.date');
    };
}
