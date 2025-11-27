import { Button, Flex, Group, Modal, Stack, Text } from '@mantine/core';
import { IconAlertCircle } from '@tabler/icons-react';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';

import { type ServiceAccount } from '@lightdash/common';
import MantineIcon from '../../../components/common/MantineIcon';

type Props = {
    isDeleting: boolean;
    isOpen: boolean;
    onClose: () => void;
    onDelete: (uuid: string) => void;
    serviceAccount: ServiceAccount;
};

export const ServiceAccountsDeleteModal: FC<Props> = ({
    isDeleting,
    isOpen,
    onClose,
    onDelete,
    serviceAccount,
}) => {
    const { t } = useTranslation();

    return (
        <Modal
            opened={isOpen}
            onClose={onClose}
            title={
                <Group spacing="xs">
                    <MantineIcon icon={IconAlertCircle} color="red" />
                    <span>
                        {t(
                            'features_service_accounts_delete_modal.delete_service_account',
                        )}
                    </span>
                </Group>
            }
            styles={(theme) => ({
                title: {
                    fontWeight: 'bold',
                    fontSize: theme.fontSizes.lg,
                },
            })}
        >
            <Stack spacing="xl">
                <Text>
                    {t('features_service_accounts_delete_modal.content.part_1')}
                    <Text fw={600} component="span">
                        {serviceAccount?.description}
                    </Text>{' '}
                    {t('features_service_accounts_delete_modal.content.part_2')}
                </Text>

                <Flex gap="sm" justify="flex-end">
                    <Button
                        color="dark"
                        variant="outline"
                        disabled={isDeleting}
                        onClick={onClose}
                    >
                        {t('features_service_accounts_delete_modal.cancel')}
                    </Button>
                    <Button
                        color="red"
                        disabled={isDeleting}
                        onClick={() => {
                            onDelete(serviceAccount?.uuid ?? '');
                        }}
                    >
                        {t('features_service_accounts_delete_modal.delete')}
                    </Button>
                </Flex>
            </Stack>
        </Modal>
    );
};
