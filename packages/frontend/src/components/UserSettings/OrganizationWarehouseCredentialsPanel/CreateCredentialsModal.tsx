import {
    SnowflakeAuthenticationType,
    WarehouseTypes,
    type CreateOrganizationWarehouseCredentials,
    type OrganizationWarehouseCredentials,
} from '@lightdash/common';
import { Button, Group, Modal, Title, type ModalProps } from '@mantine/core';
import { useForm } from '@mantine/form';
import React, { type FC } from 'react';
import { useTranslation } from 'react-i18next';

import { useCreateOrganizationWarehouseCredentials } from '../../../hooks/organization/useOrganizationWarehouseCredentials';
import { SnowflakeCredentialsForm } from './SnowflakeCredentialsForm';

type Props = Pick<ModalProps, 'opened' | 'onClose'> & {
    title?: React.ReactNode;
    description?: React.ReactNode;
    nameValue?: string;
    onSuccess?: (data: OrganizationWarehouseCredentials) => void;
};

export const CreateCredentialsModal: FC<Props> = ({
    opened,
    onClose,
    title,
    description,
    nameValue,
    onSuccess,
}) => {
    const { t } = useTranslation();

    const [isAuthenticated, setIsAuthenticated] = React.useState(false);
    const { mutateAsync, isLoading: isSaving } =
        useCreateOrganizationWarehouseCredentials();
    const form = useForm<CreateOrganizationWarehouseCredentials>({
        initialValues: {
            name: '',
            description: '',
            credentials: {
                type: WarehouseTypes.SNOWFLAKE,
                authenticationType: SnowflakeAuthenticationType.SSO,
                account: '',
                database: '',
                warehouse: '',
                schema: '',
                user: '',
                override: false,
                requireUserCredentials: false,
                clientSessionKeepAlive: false,
                queryTag: '',
                accessUrl: '',
                startOfWeek: null,
            },
        },
    });
    return (
        <Modal
            size="lg"
            title={
                title || (
                    <Title order={4}>
                        {t(
                            'components_user_settings_organization_warehouse_credentials_panel.title',
                        )}
                    </Title>
                )
            }
            opened={opened}
            onClose={onClose}
        >
            <form
                onSubmit={form.onSubmit(async (formData) => {
                    const result = await mutateAsync({
                        name: nameValue || formData.name,
                        description: formData.description,
                        credentials: formData.credentials,
                    });
                    onSuccess?.(result);
                    onClose();
                })}
            >
                {description}

                <SnowflakeCredentialsForm
                    form={form}
                    disabled={isSaving}
                    showName={!nameValue}
                    onAuthenticated={setIsAuthenticated}
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
                            'components_user_settings_organization_warehouse_credentials_panel.cancel',
                        )}
                    </Button>
                    <Button
                        size="xs"
                        type="submit"
                        disabled={isSaving || !isAuthenticated}
                        loading={isSaving}
                    >
                        {t(
                            'components_user_settings_organization_warehouse_credentials_panel.save',
                        )}
                    </Button>
                </Group>
            </form>
        </Modal>
    );
};
