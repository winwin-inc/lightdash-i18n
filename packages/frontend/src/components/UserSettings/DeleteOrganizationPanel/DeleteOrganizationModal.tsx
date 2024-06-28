import {
    Button,
    Group,
    Modal,
    Stack,
    Text,
    TextInput,
    Title,
    type ModalProps,
} from '@mantine/core';
import { IconAlertCircle } from '@tabler/icons-react';
import { useState, type FC } from 'react';
import { useTranslation } from 'react-i18next';

import { useOrganization } from '../../../hooks/organization/useOrganization';
import { useDeleteOrganizationMutation } from '../../../hooks/organization/useOrganizationDeleteMultation';
import MantineIcon from '../../common/MantineIcon';

export const OrganizationDeleteModal: FC<
    Pick<ModalProps, 'opened' | 'onClose'>
> = ({ opened, onClose }) => {
    const { t } = useTranslation();

    const { isInitialLoading, data: organization } = useOrganization();
    const { mutateAsync, isLoading: isDeleting } =
        useDeleteOrganizationMutation();

    const [confirmOrgName, setConfirmOrgName] = useState<string>();

    if (isInitialLoading || !organization) return null;

    const handleConfirm = async () => {
        await mutateAsync(organization.organizationUuid);
        onClose();
    };

    const handleOnClose = () => {
        setConfirmOrgName(undefined);
        onClose();
    };

    return (
        <Modal
            size="md"
            opened={opened}
            title={
                <Group spacing="xs">
                    <MantineIcon size="lg" icon={IconAlertCircle} color="red" />
                    <Title order={4}>
                        {t(
                            'components_user_settings_delete_organization_modal.delete_organization',
                        )}
                    </Title>
                </Group>
            }
            onClose={handleOnClose}
        >
            <Stack>
                <Text>
                    {t(
                        'components_user_settings_delete_organization_modal.content.part_1',
                    )}{' '}
                    <b>{organization.name}</b>{' '}
                    {t(
                        'components_user_settings_delete_organization_modal.content.part_2',
                    )}
                </Text>

                <TextInput
                    name="confirmOrgName"
                    placeholder={organization.name}
                    value={confirmOrgName}
                    onChange={(e) => setConfirmOrgName(e.target.value)}
                />

                <Group position="right" spacing="xs">
                    <Button
                        variant="outline"
                        onClick={handleOnClose}
                        color="dark"
                    >
                        {t(
                            'components_user_settings_delete_organization_modal.cancel',
                        )}
                    </Button>

                    <Button
                        color="red"
                        disabled={
                            confirmOrgName?.toLowerCase() !==
                            organization.name.toLowerCase()
                        }
                        loading={isDeleting}
                        onClick={() => handleConfirm()}
                        type="submit"
                    >
                        {t(
                            'components_user_settings_delete_organization_modal.delete',
                        )}
                    </Button>
                </Group>
            </Stack>
        </Modal>
    );
};
