import {
    WarehouseTypes,
    type UpsertUserWarehouseCredentials,
    type UserWarehouseCredentials,
} from '@lightdash/common';
import {
    Button,
    Group,
    Modal,
    Stack,
    TextInput,
    Title,
    type ModalProps,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';

import { useUserWarehouseCredentialsUpdateMutation } from '../../../hooks/userWarehouseCredentials/useUserWarehouseCredentials';
import { WarehouseFormInputs } from './WarehouseFormInputs';

const getCredentialsWithPlaceholders = (
    credentials: UserWarehouseCredentials['credentials'],
): UpsertUserWarehouseCredentials['credentials'] => {
    switch (credentials.type) {
        case WarehouseTypes.REDSHIFT:
        case WarehouseTypes.SNOWFLAKE:
        case WarehouseTypes.POSTGRES:
        case WarehouseTypes.TRINO:
            return {
                ...credentials,
                password: '',
            };
        case WarehouseTypes.BIGQUERY:
            return {
                ...credentials,
                keyfileContents: {},
            };
        case WarehouseTypes.DATABRICKS:
            return {
                ...credentials,
                personalAccessToken: '',
            };
        default:
            throw new Error(`Credential type not supported`);
    }
};

export const EditCredentialsModal: FC<
    Pick<ModalProps, 'opened' | 'onClose'> & {
        userCredentials: UserWarehouseCredentials;
    }
> = ({ opened, onClose, userCredentials }) => {
    const { t } = useTranslation();
    const { mutateAsync, isLoading: isSaving } =
        useUserWarehouseCredentialsUpdateMutation(userCredentials.uuid);
    const form = useForm<UpsertUserWarehouseCredentials>({
        initialValues: {
            name: userCredentials.name,
            credentials: getCredentialsWithPlaceholders(
                userCredentials.credentials,
            ),
        },
    });

    return (
        <Modal
            title={
                <Title order={4}>
                    {t(
                        'components_user_settings_my_warehouse_connections_panel.edit_credentials.edit_credentials',
                    )}
                </Title>
            }
            opened={opened}
            onClose={onClose}
        >
            <form
                onSubmit={form.onSubmit(async (formData) => {
                    await mutateAsync(formData);
                    onClose();
                })}
            >
                <Stack spacing="xs">
                    <TextInput
                        required
                        size="xs"
                        label={t(
                            'components_user_settings_my_warehouse_connections_panel.edit_credentials.form.label.name',
                        )}
                        disabled={isSaving}
                        {...form.getInputProps('name')}
                    />

                    <WarehouseFormInputs
                        onClose={onClose}
                        form={form}
                        disabled={isSaving}
                    />

                    <Group position="right" spacing="xs" mt="sm">
                        <Button
                            size="xs"
                            variant="outline"
                            color="dark"
                            onClick={onClose}
                            disabled={isSaving}
                        >
                            {t(
                                'components_user_settings_my_warehouse_connections_panel.edit_credentials.cancel',
                            )}
                        </Button>

                        <Button size="xs" type="submit" disabled={isSaving}>
                            {t(
                                'components_user_settings_my_warehouse_connections_panel.edit_credentials.save',
                            )}
                        </Button>
                    </Group>
                </Stack>
            </form>
        </Modal>
    );
};
