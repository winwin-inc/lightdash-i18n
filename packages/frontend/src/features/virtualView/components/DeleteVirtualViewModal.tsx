import { Button, Group, Modal, Stack, Text } from '@mantine/core';
import { IconTrash } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';

import MantineIcon from '../../../components/common/MantineIcon';
import { useDeleteVirtualView } from '../../virtualView/hooks/useVirtualView';

export const DeleteVirtualViewModal = ({
    opened,
    onClose,
    virtualViewName,
    projectUuid,
}: {
    opened: boolean;
    onClose: () => void;
    virtualViewName: string;
    projectUuid: string;
}) => {
    const { t } = useTranslation();

    const { mutate, isLoading } = useDeleteVirtualView(projectUuid);
    const onDelete = () => {
        mutate({ projectUuid, name: virtualViewName });
        // TODO: run validation query
        onClose();
    };
    return (
        <Modal
            opened={opened}
            onClose={onClose}
            keepMounted={false}
            title={
                <Group spacing="xs">
                    <MantineIcon icon={IconTrash} size="lg" color="gray.7" />
                    <Text fw={500}>
                        {t('components_virtual_view.delete.title')}
                    </Text>
                </Group>
            }
            styles={(theme) => ({
                header: { borderBottom: `1px solid ${theme.colors.gray[4]}` },
            })}
        >
            <Stack pt="sm">
                <Text>{t('components_virtual_view.delete.content')}</Text>

                <Group position="right" mt="sm">
                    <Button color="dark" variant="outline" onClick={onClose}>
                        {t('components_virtual_view.delete.cancel')}
                    </Button>

                    <Button loading={isLoading} color="red" onClick={onDelete}>
                        {t('components_virtual_view.delete.delete')}
                    </Button>
                </Group>
            </Stack>
        </Modal>
    );
};
