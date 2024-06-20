import { Select } from '@mantine/core';
import React, { type FC } from 'react';
import { useTranslation } from 'react-i18next';

import { Frequency } from './cronInputUtils';

type FrequencyItem = {
    value: Frequency;
    label: string;
};

const FrequencySelect: FC<{
    disabled?: boolean;
    value: Frequency;
    onChange: (value: Frequency) => void;
}> = ({ disabled, value, onChange }) => {
    const { t } = useTranslation();

    const FrequencyItems: Array<FrequencyItem> = [
        {
            value: Frequency.HOURLY,
            label: t('components_react_hook_form.frequency_items.hourly'),
        },
        {
            value: Frequency.DAILY,
            label: t('components_react_hook_form.frequency_items.daily'),
        },
        {
            value: Frequency.WEEKLY,
            label: t('components_react_hook_form.frequency_items.weekly'),
        },
        {
            value: Frequency.MONTHLY,
            label: t('components_react_hook_form.frequency_items.monthly'),
        },
        {
            value: Frequency.CUSTOM,
            label: t(
                'components_react_hook_form.frequency_items.custon_cron_expression',
            ),
        },
    ];

    return (
        <Select
            data={FrequencyItems}
            value={value}
            withinPortal
            disabled={disabled}
            onChange={onChange}
            w={210}
            sx={{ alignSelf: 'start' }}
        />
    );
};
export default FrequencySelect;
