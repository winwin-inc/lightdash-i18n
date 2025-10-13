import { type OrganizationWarehouseCredentials } from '@lightdash/common';
import {
    Button,
    Group,
    LoadingOverlay,
    Stack,
    Text,
    Title,
} from '@mantine/core';
import { IconDatabaseCog, IconPlus } from '@tabler/icons-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useOrganizationWarehouseCredentials } from '../../../hooks/organization/useOrganizationWarehouseCredentials';
import { EmptyState } from '../../common/EmptyState';
import MantineIcon from '../../common/MantineIcon';
import { CreateCredentialsModal } from './CreateCredentialsModal';
import { CredentialsTable } from './CredentialsTable';
import { DeleteCredentialsModal } from './DeleteCredentialsModal';
import { EditCredentialsModal } from './EditCredentialsModal';

export const OrganizationWarehouseCredentialsPanel = () => {
    const { t } = useTranslation();

    const { data: credentials, isLoading } =
        useOrganizationWarehouseCredentials();
    const [isCreatingCredentials, setIsCreatingCredentials] = useState(false);
    const [warehouseCredentialsToBeEdited, setWarehouseCredentialsToBeEdited] =
        useState<OrganizationWarehouseCredentials | undefined>(undefined);
    const [
        warehouseCredentialsToBeDeleted,
        setWarehouseCredentialsToBeDeleted,
    ] = useState<OrganizationWarehouseCredentials | undefined>(undefined);

    if (isLoading) {
        return <LoadingOverlay visible={isLoading} />;
    }
    return (
        <>
            <Stack mb="lg">
                {credentials && credentials.length > 0 ? (
                    <>
                        <Group position="apart">
                            <Stack spacing="one">
                                <Title order={5}>
                                    {t(
                                        'components_user_settings_organization_warehouse_credentials_panel.organization_warehouse_credentials',
                                    )}
                                </Title>
                                <Text c="gray.6" fz="xs">
                                    {t(
                                        'components_user_settings_organization_warehouse_credentials_panel.content.part_1',
                                    )}
                                </Text>
                            </Stack>
                            <Button
                                size="xs"
                                leftIcon={<MantineIcon icon={IconPlus} />}
                                onClick={() => setIsCreatingCredentials(true)}
                            >
                                {t(
                                    'components_user_settings_organization_warehouse_credentials_panel.content.part_2',
                                )}
                            </Button>
                        </Group>
                        <CredentialsTable
                            credentials={credentials}
                            setWarehouseCredentialsToBeDeleted={
                                setWarehouseCredentialsToBeDeleted
                            }
                            setWarehouseCredentialsToBeEdited={
                                setWarehouseCredentialsToBeEdited
                            }
                        />
                    </>
                ) : (
                    <EmptyState
                        icon={
                            <MantineIcon
                                icon={IconDatabaseCog}
                                color="gray.6"
                                stroke={1}
                                size="5xl"
                            />
                        }
                        title={t(
                            'components_user_settings_organization_warehouse_credentials_panel.empty.title',
                        )}
                        description={t(
                            'components_user_settings_organization_warehouse_credentials_panel.empty.description',
                        )}
                    >
                        <Button onClick={() => setIsCreatingCredentials(true)}>
                            {t(
                                'components_user_settings_organization_warehouse_credentials_panel.empty.add_new_credentials',
                            )}
                        </Button>
                    </EmptyState>
                )}
            </Stack>

            {!!warehouseCredentialsToBeEdited && (
                <EditCredentialsModal
                    opened={!!warehouseCredentialsToBeEdited}
                    onClose={() => setWarehouseCredentialsToBeEdited(undefined)}
                    organizationCredentials={warehouseCredentialsToBeEdited}
                />
            )}

            {isCreatingCredentials && (
                <CreateCredentialsModal
                    opened={isCreatingCredentials}
                    onClose={() => setIsCreatingCredentials(false)}
                />
            )}

            {warehouseCredentialsToBeDeleted && (
                <DeleteCredentialsModal
                    opened={!!warehouseCredentialsToBeDeleted}
                    onClose={() =>
                        setWarehouseCredentialsToBeDeleted(undefined)
                    }
                    warehouseCredentialsToBeDeleted={
                        warehouseCredentialsToBeDeleted
                    }
                />
            )}
        </>
    );
};
