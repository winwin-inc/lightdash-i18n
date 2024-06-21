import { type GroupWithMembers } from '@lightdash/common';
import { Button, Group, Modal, Text, Title } from '@mantine/core';
import { IconKey } from '@tabler/icons-react';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';

import MantineIcon from '../../../components/common/MantineIcon';

type RevokeProjectGroupAccessModalProps = {
    group: GroupWithMembers;
    onDelete: () => void;
    onClose: () => void;
};

const RevokeProjectGroupAccessModal: FC<RevokeProjectGroupAccessModalProps> = ({
    group,
    onDelete,
    onClose,
}) => {
    const { t } = useTranslation();

    return (
        <Modal
            opened
            onClose={onClose}
            title={
                <Group spacing="xs">
                    <MantineIcon size="lg" icon={IconKey} color="red" />
                    <Title order={4}>
                        {t('features_project_group_access_revoke_modal.title')}
                    </Title>
                </Group>
            }
        >
            <Text pb="md">
                {t('features_project_group_access_revoke_modal.content')}"
                {group.name}"?
            </Text>

            <Group spacing="xs" position="right">
                <Button variant="outline" onClick={onClose} color="dark">
                    {t('features_project_group_access_revoke_modal.cancel')}
                </Button>

                <Button color="red" onClick={onDelete}>
                    {t('features_project_group_access_revoke_modal.revoke')}
                </Button>
            </Group>
        </Modal>
    );
};

export default RevokeProjectGroupAccessModal;
