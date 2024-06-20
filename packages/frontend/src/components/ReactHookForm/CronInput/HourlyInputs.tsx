import { Group, Input, NumberInput } from '@mantine/core';
import React, { type FC } from 'react';
import { useTranslation } from 'react-i18next';

import { getHourlyCronExpression, parseCronExpression } from './cronInputUtils';

const HourlyInputs: FC<{
    disabled?: boolean;
    cronExpression: string;
    onChange: (value: string) => void;
}> = ({ disabled, cronExpression, onChange }) => {
    const { t } = useTranslation();

    const minutes = parseCronExpression(cronExpression).minutes;

    const onMinuteChange = (valueAsNumber: number) => {
        if (
            Number.isInteger(valueAsNumber) &&
            valueAsNumber >= 0 &&
            valueAsNumber <= 59
        ) {
            onChange(getHourlyCronExpression(valueAsNumber));
        }
    };

    return (
        <Group spacing="sm">
            <Input.Label>
                {t('components_react_hook_form.at_minute')}
            </Input.Label>
            <NumberInput
                value={minutes}
                onChange={onMinuteChange}
                disabled={disabled}
                w="6xl"
                min={0}
                max={59}
            />
        </Group>
    );
};
export default HourlyInputs;
