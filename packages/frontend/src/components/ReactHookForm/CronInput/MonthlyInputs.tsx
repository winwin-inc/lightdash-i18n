import { Group, Input, NumberInput } from '@mantine/core';
import React, { type FC } from 'react';
import { useTranslation } from 'react-i18next';

import {
    getMonthlyCronExpression,
    parseCronExpression,
} from './cronInputUtils';
import TimePicker from './TimePicker';

const MonthlyInputs: FC<{
    disabled?: boolean;
    cronExpression: string;
    onChange: (value: string) => void;
}> = ({ disabled, cronExpression, onChange }) => {
    const { t } = useTranslation();

    const { minutes, hours, day } = parseCronExpression(cronExpression);

    const onDayChange = (newDay: number) => {
        if (newDay >= 1 && newDay <= 31) {
            onChange(getMonthlyCronExpression(minutes, hours, newDay));
        }
    };

    const onTimeChange = (newTime: { minutes: number; hours: number }) => {
        onChange(getMonthlyCronExpression(newTime.minutes, newTime.hours, day));
    };

    return (
        <Group spacing="sm">
            <Input.Label>{t('components_react_hook_form.on_day')}</Input.Label>
            <NumberInput
                value={day}
                onChange={onDayChange}
                disabled={disabled}
                w="6xl"
                min={1}
                max={31}
            />
            <Input.Label>{t('components_react_hook_form.at')}</Input.Label>
            <TimePicker
                disabled={disabled}
                cronExpression={cronExpression}
                onChange={onTimeChange}
            />
        </Group>
    );
};
export default MonthlyInputs;
