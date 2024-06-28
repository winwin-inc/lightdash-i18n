import {
    WarehouseTypes,
    type UpsertUserWarehouseCredentials,
} from '@lightdash/common';
import { PasswordInput, TextInput } from '@mantine/core';
import { type UseFormReturnType } from '@mantine/form';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';

export const WarehouseFormInputs: FC<{
    disabled: boolean;
    form: UseFormReturnType<UpsertUserWarehouseCredentials>;
}> = ({ form, disabled }) => {
    const { t } = useTranslation();

    switch (form.values.credentials.type) {
        case WarehouseTypes.REDSHIFT:
        case WarehouseTypes.SNOWFLAKE:
        case WarehouseTypes.POSTGRES:
        case WarehouseTypes.TRINO:
            return (
                <>
                    <TextInput
                        required
                        size="xs"
                        label={t(
                            'components_user_settings_my_warehouse_connections_panel.warehouse_form.username',
                        )}
                        disabled={disabled}
                        {...form.getInputProps('credentials.user')}
                    />
                    <PasswordInput
                        required
                        size="xs"
                        label={t(
                            'components_user_settings_my_warehouse_connections_panel.warehouse_form.password',
                        )}
                        disabled={disabled}
                        {...form.getInputProps('credentials.password')}
                    />
                </>
            );
        case WarehouseTypes.BIGQUERY:
            return <>{/* Add key file content input - JSON? */}</>;
        case WarehouseTypes.DATABRICKS:
            return <>{/* Add personal access token input */}</>;
        default:
            return null;
    }
};
