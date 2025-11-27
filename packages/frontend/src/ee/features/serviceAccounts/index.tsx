import { Button, Group, Stack, Title } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconUsersGroup } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';

import { EmptyState } from '../../../components/common/EmptyState';
import MantineIcon from '../../../components/common/MantineIcon';

import { useState } from 'react';
import { ServiceAccountsCreateModal } from './ServiceAccountsCreateModal';
import { ServiceAccountsTable } from './ServiceAccountsTable';
import { useServiceAccounts } from './useServiceAccounts';

export function ServiceAccountsPage() {
    const [opened, { open, close }] = useDisclosure(false);
    const { listAccounts, createAccount, deleteAccount } = useServiceAccounts();
    const [token, setToken] = useState<string>();
    const { t } = useTranslation();

    const handleCloseModal = () => {
        setToken(undefined);
        close();
    };

    const handleSaveAccount = async (values: any) => {
        const data = await createAccount.mutateAsync(values);
        setToken(data.token);
    };

    const hasAccounts = listAccounts?.data?.length ?? 0 > 0;

    return (
        <Stack mb="lg">
            {hasAccounts ? (
                <>
                    <Group position="apart">
                        <Title size="h5">
                            {t('features_service_accounts.service_accounts')}
                        </Title>
                        <Button onClick={open} size="xs">
                            {t('features_service_accounts.add_service_account')}
                        </Button>
                    </Group>
                    <ServiceAccountsTable
                        accounts={listAccounts?.data ?? []}
                        onDelete={deleteAccount.mutate}
                        isDeleting={deleteAccount.isLoading}
                    />
                </>
            ) : (
                <EmptyState
                    icon={
                        <MantineIcon
                            icon={IconUsersGroup}
                            color="gray.6"
                            stroke={1}
                            size="5xl"
                        />
                    }
                    title={t('features_service_accounts.no_service_accounts')}
                    description={t(
                        'features_service_accounts.no_service_accounts_description',
                    )}
                >
                    <Button onClick={open}>
                        {t('features_service_accounts.create_service_account')}
                    </Button>
                </EmptyState>
            )}

            <ServiceAccountsCreateModal
                isOpen={opened}
                onClose={handleCloseModal}
                onSave={handleSaveAccount}
                isWorking={createAccount.isLoading}
                token={token}
            />
        </Stack>
    );
}
