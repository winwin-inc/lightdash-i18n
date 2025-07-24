import {
    Badge,
    Button,
    Group,
    HoverCard,
    Paper,
    Stack,
    Table,
    Text,
    Tooltip,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconInfoCircle, IconTrash } from '@tabler/icons-react';
import { useState, type FC } from 'react';
import { useTranslation } from 'react-i18next';

import MantineIcon from '../../../components/common/MantineIcon';
import { useTableStyles } from '../../../hooks/styles/useTableStyles';

import {
    formatDate,
    formatTimestamp,
    type ServiceAccount,
} from '@lightdash/common';
import { ServiceAccountsDeleteModal } from './ServiceAccountsDeleteModal';

const TableRow: FC<{
    onClickDelete: (serviceAccount: ServiceAccount) => void;
    serviceAccount: ServiceAccount;
}> = ({ onClickDelete, serviceAccount }) => {
    const { t } = useTranslation();

    const { description, scopes, lastUsedAt, rotatedAt, expiresAt } =
        serviceAccount;

    const scopeBadges = scopes.map((scope) => (
        <Badge
            key={scope}
            variant="filled"
            color="gray.2"
            radius="xs"
            sx={{ textTransform: 'none' }}
            px="xxs"
        >
            <Text fz="xs" fw={400} color="gray.8">
                {scope}
            </Text>
        </Badge>
    ));

    return (
        <tr>
            <td>{description}</td>
            <td width="200px">
                {scopes.length > 2 ? (
                    <HoverCard offset={-20}>
                        <HoverCard.Target>
                            <Group>{`${scopes.length} ${t('features_service_accounts_table.scopes')}`}</Group>
                        </HoverCard.Target>
                        <HoverCard.Dropdown>
                            <Stack>
                                <Text fw="700">{t('features_service_accounts_table.selected_scopes')}</Text>
                                {scopeBadges}
                            </Stack>
                        </HoverCard.Dropdown>
                    </HoverCard>
                ) : (
                    <Group spacing="xs">{scopeBadges}</Group>
                )}
            </td>
            <td>
                <Group align="center" position="left" spacing="xs">
                    {expiresAt ? formatDate(expiresAt) : t('features_service_accounts_table.no_expiration_date')}
                    {rotatedAt && (
                        <Tooltip
                            withinPortal
                            position="top"
                            maw={350}
                            label={`${t('features_service_accounts_table.last_rotated_at')} ${formatTimestamp(
                                rotatedAt,
                            )}`}
                        >
                            <MantineIcon
                                icon={IconInfoCircle}
                                color="gray.6"
                                size="md"
                            />
                        </Tooltip>
                    )}
                </Group>
            </td>
            <td>
                {lastUsedAt && (
                    <Tooltip
                        withinPortal
                        position="top"
                        maw={350}
                        label={formatTimestamp(lastUsedAt)}
                    >
                        <Text>{formatDate(lastUsedAt)}</Text>
                    </Tooltip>
                )}
            </td>
            <td width="1%">
                <Button
                    px="xs"
                    variant="outline"
                    size="xs"
                    color="red"
                    onClick={() => onClickDelete(serviceAccount)}
                >
                    <MantineIcon icon={IconTrash} />
                </Button>
            </td>
        </tr>
    );
};

type TableProps = {
    accounts: ServiceAccount[];
    onDelete: (uuid: string) => void;
    isDeleting: boolean;
};

export const ServiceAccountsTable: FC<TableProps> = ({
    accounts,
    onDelete,
    isDeleting,
}) => {
    const { t } = useTranslation();
    const { cx, classes } = useTableStyles();
    const [opened, { open, close }] = useDisclosure(false);

    const [serviceAccountToDelete, setServiceAccountToDelete] = useState<
        ServiceAccount | undefined
    >();

    const handleDelete = async () => {
        onDelete(serviceAccountToDelete?.uuid ?? '');
        setServiceAccountToDelete(undefined);
        close();
    };

    const handleOpenModal = (serviceAccount: ServiceAccount) => {
        setServiceAccountToDelete(serviceAccount);
        open();
    };

    const handleCloseModal = () => {
        setServiceAccountToDelete(undefined);
        close();
    };

    return (
        <>
            <Paper withBorder sx={{ overflow: 'hidden' }}>
                <Table className={cx(classes.root, classes.alignLastTdRight)}>
                    <thead>
                        <tr>
                            <th>{t('features_service_accounts_table.columns.description')}</th>
                            <th>{t('features_service_accounts_table.columns.scopes')}</th>
                            <th>{t('features_service_accounts_table.columns.expires_at')}</th>
                            <th>{t('features_service_accounts_table.columns.last_used_at')}</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                        {accounts.map((serviceAccount) => (
                            <TableRow
                                key={serviceAccount.uuid}
                                serviceAccount={serviceAccount}
                                onClickDelete={handleOpenModal}
                            />
                        ))}
                    </tbody>
                </Table>
            </Paper>

            <ServiceAccountsDeleteModal
                isOpen={opened}
                onClose={handleCloseModal}
                isDeleting={isDeleting}
                onDelete={handleDelete}
                serviceAccount={serviceAccountToDelete!}
            />
        </>
    );
};
