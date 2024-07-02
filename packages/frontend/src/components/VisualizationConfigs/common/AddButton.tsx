import { Button, type ButtonProps } from '@mantine/core';
import { type ButtonHTMLAttributes, type FC } from 'react';
import { useTranslation } from 'react-i18next';

type Props = ButtonProps & ButtonHTMLAttributes<HTMLButtonElement>;

export const AddButton: FC<Props> = ({ ...props }) => {
    const { t } = useTranslation();

    return (
        <Button
            size="sm"
            variant="subtle"
            compact
            leftIcon="+"
            {...props}
            styles={{
                leftIcon: {
                    marginRight: 2,
                },
            }}
        >
            {t('components_visualization_configs_common.add')}
        </Button>
    );
};
