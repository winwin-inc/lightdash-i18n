import { Button, Group, Modal, Stack, Text } from '@mantine/core';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';

import { type RoleWithScopes } from '@lightdash/common';

type DeleteModalProps = {
    isOpen: boolean;
    onClose: () => void;
    onDelete: () => void;
    isDeleting?: boolean;
    role: RoleWithScopes;
};

export const CustomRolesDeleteModal: FC<DeleteModalProps> = ({
    isOpen,
    onClose,
    onDelete,
    isDeleting = false,
    role,
}) => {
    const { t } = useTranslation();

    return (
        <Modal
            opened={isOpen}
            onClose={onClose}
            title={t('features_custom_roles_delete_modal.delete_custom_role')}
            size="md"
        >
            <Stack>
                <Text>
                    {t('features_custom_roles_delete_modal.content.part_1')}
                    <Text component="span" weight="bold">
                        {role.name}
                    </Text>
                    {t('features_custom_roles_delete_modal.content.part_2')}
                </Text>
                <Text size="sm" color="dimmed">
                    {t('features_custom_roles_delete_modal.content.part_3')}
                </Text>
                <Group position="right" mt="md">
                    <Button
                        variant="outline"
                        onClick={onClose}
                        disabled={isDeleting}
                    >
                        {t('features_custom_roles_delete_modal.cancel')}
                    </Button>
                    <Button color="red" onClick={onDelete} loading={isDeleting}>
                        {t('features_custom_roles_delete_modal.delete')}
                    </Button>
                </Group>
            </Stack>
        </Modal>
    );
};
