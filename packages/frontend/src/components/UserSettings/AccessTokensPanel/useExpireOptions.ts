import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import useHealth from '../../../hooks/health/useHealth';

export const useExpireOptions = (includeNoExpiration = false) => {
    const health = useHealth();
    const { t } = useTranslation();

    return useMemo(() => {
        const options = [
            {
                label: t('components_user_settings_access_tokens_panel_create_token.expire_options.no_expiration'),
                value: '',
            },
            {
                label: t('components_user_settings_access_tokens_panel_create_token.expire_options.days_7'),
                value: '7',
            },
            {
                label: t('components_user_settings_access_tokens_panel_create_token.expire_options.days_30'),
                value: '30',
            },
            {
                label: t('components_user_settings_access_tokens_panel_create_token.expire_options.days_60'),
                value: '60',
            },
            {
                label: t('components_user_settings_access_tokens_panel_create_token.expire_options.days_90'),
                value: '90',
            },
        ];

        const maxExpirationTimeInDays =
            health.data?.auth.pat.maxExpirationTimeInDays;

        return options.filter((option) => {
            if (option.value === '') {
                return includeNoExpiration;
            }
            if (!maxExpirationTimeInDays) return true;
            return parseFloat(option.value) <= maxExpirationTimeInDays;
        });
    }, [health.data?.auth.pat.maxExpirationTimeInDays, includeNoExpiration, t]);
};
