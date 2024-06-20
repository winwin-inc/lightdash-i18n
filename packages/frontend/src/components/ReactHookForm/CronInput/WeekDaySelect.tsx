import { Select } from '@mantine/core';
import React, { type FC } from 'react';
import { useTranslation } from 'react-i18next';

type Option = {
    value: string;
    label: string;
};

const WeekDaySelect: FC<{
    disabled?: boolean;
    value: number;
    onChange: (value: number) => void;
}> = ({ disabled, value, onChange }) => {
    const { t } = useTranslation();

    const Options: Array<Option> = [
        {
            value: '0',
            label: t('components_react_hook_form.options.sunday'),
        },
        {
            value: '1',
            label: t('components_react_hook_form.options.monday'),
        },
        {
            value: '2',
            label: t('components_react_hook_form.options.tuesday'),
        },
        {
            value: '3',
            label: t('components_react_hook_form.options.wednesday'),
        },
        {
            value: '4',
            label: t('components_react_hook_form.options.thursday'),
        },
        {
            value: '5',
            label: t('components_react_hook_form.options.friday'),
        },
        {
            value: '6',
            label: t('components_react_hook_form.options.saturday'),
        },
    ];

    return (
        <Select
            data={Options}
            value={String(value)}
            disabled={disabled}
            withinPortal
            w={140}
            onChange={(val) => {
                onChange(Number(val));
            }}
        />
    );
};
export default WeekDaySelect;
