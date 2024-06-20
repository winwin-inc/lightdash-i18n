import { Switch } from '@mantine/core';
import React, { type FC } from 'react';
import { useTranslation } from 'react-i18next';

import InputWrapper, { type InputWrapperProps } from './InputWrapper';

interface Props extends Omit<InputWrapperProps, 'render'> {
    switchProps?: React.ComponentProps<typeof Switch>;
}

const BooleanSwitch: FC<Props> = ({ switchProps, ...rest }) => {
    const { t } = useTranslation();

    return (
        <InputWrapper
            {...rest}
            render={(props, { field }) => (
                <Switch
                    onLabel={t('components_react_hook_form.switch.yes')}
                    offLabel={t('components_react_hook_form.switch.no')}
                    {...switchProps}
                    checked={field.value}
                    {...props}
                    {...field}
                    size="md"
                />
            )}
        />
    );
};

export default BooleanSwitch;
