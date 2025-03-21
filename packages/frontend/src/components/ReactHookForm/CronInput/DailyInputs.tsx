import { Group, Input } from '@mantine/core';
import React, { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { getDailyCronExpression } from './cronInputUtils';
import TimePicker from './TimePicker';

const DailyInputs: FC<{
    disabled?: boolean;
    cronExpression: string;
    onChange: (value: string) => void;
}> = ({ disabled, cronExpression, onChange }) => {
    const { t } = useTranslation();

    const handleChange = (newTime: { hours: number; minutes: number }) => {
        onChange(getDailyCronExpression(newTime.minutes, newTime.hours));
    };

    return (
        <Group spacing="sm">
            <Input.Label>{t('components_react_hook_form.at')}</Input.Label>
            <TimePicker
                disabled={disabled}
                cronExpression={cronExpression}
                onChange={handleChange}
            />
        </Group>
    );
};
export default DailyInputs;
