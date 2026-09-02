import { useTranslation } from 'react-i18next';

export const useMergeQueryTranslation = () => {
    const { t } = useTranslation();

    return {
        t: (key: string, options?: Record<string, unknown>) =>
            t(`features_mergeQuery.${key}`, options),
    };
};
