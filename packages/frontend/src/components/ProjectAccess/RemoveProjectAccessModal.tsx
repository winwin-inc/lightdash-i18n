import { Button, Group, Modal, Text, Title } from '@mantine/core';
import { IconKey } from '@tabler/icons-react';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';

import { type ProjectUserWithRole } from '../../hooks/useProjectUsersWithRoles';
import MantineIcon from '../common/MantineIcon';

type Props = {
    user: Pick<ProjectUserWithRole, 'email'>;
    onDelete: () => void;
    onClose: () => void;
};

const RemoveProjectAccessModal: FC<Props> = ({ user, onDelete, onClose }) => {
    const { t } = useTranslation();

    return (
        <Modal
            opened
            onClose={onClose}
            title={
                <Group spacing="xs">
                    <MantineIcon size="lg" icon={IconKey} color="red" />
                    <Title order={4}>
                        {t('components_project_access_remove_modal.title')}
                    </Title>
                </Group>
            }
        >
            <Text pb="md">
                {t('components_project_access_remove_modal.content')}{' '}
                {user.email} ?
            </Text>
            <Group spacing="xs" position="right">
                <Button variant="outline" onClick={onClose} color="dark">
                    {t('components_project_access_remove_modal.cancel')}
                </Button>
                <Button color="red" onClick={onDelete}>
                    {t('components_project_access_remove_modal.delete')}
                </Button>
            </Group>
        </Modal>
    );
};

export default RemoveProjectAccessModal;
