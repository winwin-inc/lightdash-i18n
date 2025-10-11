import { type OrganizationWarehouseCredentials } from '@lightdash/common';
import {
    Button,
    Group,
    Modal,
    Stack,
    Text,
    Title,
    type ModalProps,
} from '@mantine/core';
import { IconAlertCircle } from '@tabler/icons-react';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';

import { useDeleteOrganizationWarehouseCredentials } from '../../../hooks/organization/useOrganizationWarehouseCredentials';
import MantineIcon from '../../common/MantineIcon';

type Props = Pick<ModalProps, 'opened' | 'onClose'> & {
    warehouseCredentialsToBeDeleted: OrganizationWarehouseCredentials;
};

export const DeleteCredentialsModal: FC<Props> = ({
    opened,
    onClose,
    warehouseCredentialsToBeDeleted,
}) => {
    const { t } = useTranslation();
    const { mutateAsync, isLoading: isDeleting } =
        useDeleteOrganizationWarehouseCredentials();

    return (
        <Modal
            title={
                <Group spacing="xs">
                    <MantineIcon size="lg" icon={IconAlertCircle} color="red" />
                    <Title order={4}>
                        {t(
                            'components_user_settings_organization_warehouse_credentials_panel.delete_credentials.delete_credentials',
                        )}
                    </Title>
                </Group>
            }
            opened={opened}
            onClose={onClose}
        >
            <Stack>
                <Text fz="sm">
                    {t(
                        'components_user_settings_organization_warehouse_credentials_panel.delete_credentials.content.part_1',
                    )}{' '}
                    <b>{warehouseCredentialsToBeDeleted.name}</b>?
                </Text>

                <Group position="right" spacing="xs">
                    <Button
                        size="xs"
                        variant="outline"
                        onClick={onClose}
                        color="dark"
                        disabled={isDeleting}
                    >
                        {t(
                            'components_user_settings_organization_warehouse_credentials_panel.delete_credentials.cancel',
                        )}
                    </Button>

                    <Button
                        size="xs"
                        color="red"
                        onClick={async () => {
                            await mutateAsync(
                                warehouseCredentialsToBeDeleted.organizationWarehouseCredentialsUuid,
                            );
                            onClose();
                        }}
                        type="submit"
                        loading={isDeleting}
                        disabled={isDeleting}
                    >
                        {t(
                            'components_user_settings_organization_warehouse_credentials_panel.delete_credentials.delete',
                        )}
                    </Button>
                </Group>
            </Stack>
        </Modal>
    );
};
