import { type UserWarehouseCredentials } from '@lightdash/common';
import { Anchor, Button, Group, Stack, Text, Title } from '@mantine/core';
import { IconDatabaseCog, IconPlus } from '@tabler/icons-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useUserWarehouseCredentials } from '../../../hooks/userWarehouseCredentials/useUserWarehouseCredentials';
import { EmptyState } from '../../common/EmptyState';
import MantineIcon from '../../common/MantineIcon';
import { CreateCredentialsModal } from './CreateCredentialsModal';
import { CredentialsTable } from './CredentialsTable';
import { DeleteCredentialsModal } from './DeleteCredentialsModal';
import { EditCredentialsModal } from './EditCredentialsModal';

export const MyWarehouseConnectionsPanel = () => {
    const { t } = useTranslation();
    const { data: credentials } = useUserWarehouseCredentials();
    const [isCreatingCredentials, setIsCreatingCredentials] = useState(false);
    const [warehouseCredentialsToBeEdited, setWarehouseCredentialsToBeEdited] =
        useState<UserWarehouseCredentials | undefined>(undefined);
    const [
        warehouseCredentialsToBeDeleted,
        setWarehouseCredentialsToBeDeleted,
    ] = useState<UserWarehouseCredentials | undefined>(undefined);

    const personalConnectionsCallout = (
        <Text c="dimmed">
            {t(
                'components_user_settings_my_warehouse_connections_panel.empty.personal_connections_callout',
            )}{' '}
            <Anchor
                role="button"
                href="https://docs.lightdash.com/references/personal-warehouse-connections"
                target="_blank"
                rel="noreferrer"
            >
                {t(
                    'components_user_settings_my_warehouse_connections_panel.empty.learn_more',
                )}
            </Anchor>
            {t(
                'components_user_settings_my_warehouse_connections_panel.empty.dot',
            )}
        </Text>
    );

    return (
        <>
            <Stack mb="lg">
                {credentials && credentials.length > 0 ? (
                    <>
                        <Group position="apart">
                            <Stack spacing="one">
                                <Title order={5}>
                                    {t(
                                        'components_user_settings_my_warehouse_connections_panel.groups.my_warehouse_connections',
                                    )}
                                </Title>
                                <Text c="gray.6" fz="xs">
                                    {t(
                                        'components_user_settings_my_warehouse_connections_panel.groups.add_credentials',
                                    )}
                                </Text>
                            </Stack>
                            <Button
                                size="xs"
                                leftIcon={<MantineIcon icon={IconPlus} />}
                                onClick={() => setIsCreatingCredentials(true)}
                            >
                                {t(
                                    'components_user_settings_my_warehouse_connections_panel.groups.add_new_credentials',
                                )}
                            </Button>
                        </Group>
                        {personalConnectionsCallout}
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
                            'components_user_settings_my_warehouse_connections_panel.empty.title',
                        )}
                        description={
                            <>
                                <Text>
                                    {t(
                                        'components_user_settings_my_warehouse_connections_panel.empty.description',
                                    )}
                                </Text>
                                <br />
                                {personalConnectionsCallout}
                            </>
                        }
                    >
                        <Button onClick={() => setIsCreatingCredentials(true)}>
                            {t(
                                'components_user_settings_my_warehouse_connections_panel.empty.add_new_credentials',
                            )}
                        </Button>
                    </EmptyState>
                )}
            </Stack>

            {!!warehouseCredentialsToBeEdited && (
                <EditCredentialsModal
                    opened={!!warehouseCredentialsToBeEdited}
                    onClose={() => setWarehouseCredentialsToBeEdited(undefined)}
                    userCredentials={warehouseCredentialsToBeEdited}
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
