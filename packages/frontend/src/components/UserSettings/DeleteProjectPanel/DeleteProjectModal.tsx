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

import { useDeleteActiveProjectMutation } from '../../../hooks/useActiveProject';
import { useProject } from '../../../hooks/useProject';
import { useDeleteProjectMutation } from '../../../hooks/useProjects';
import MantineIcon from '../../common/MantineIcon';

export const ProjectDeleteModal: FC<
    Pick<ModalProps, 'opened' | 'onClose'> & {
        projectUuid: string;
        isCurrentProject: boolean;
    }
> = ({ opened, onClose, projectUuid, isCurrentProject }) => {
    const { t } = useTranslation();
    const { isInitialLoading, data: project } = useProject(projectUuid);
    const { mutateAsync, isLoading: isDeleting } = useDeleteProjectMutation();
    const { mutate: deleteActiveProjectMutation } =
        useDeleteActiveProjectMutation();

    const [confirmOrgName, setConfirmOrgName] = useState<string>();

    if (isInitialLoading || !project) return null;

    const handleConfirm = async () => {
        await mutateAsync(projectUuid);
        if (isCurrentProject) {
            deleteActiveProjectMutation();
        }
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
                            'components_user_settings_delete_project_modal.delete_project',
                        )}
                    </Title>
                </Group>
            }
            onClose={handleOnClose}
        >
            <Stack>
                <Text>
                    {t(
                        'components_user_settings_delete_project_modal.content.part_1',
                    )}{' '}
                    <Text span fw={600}>
                        {project.name}
                    </Text>{' '}
                    {t(
                        'components_user_settings_delete_project_modal.content.part_2',
                    )}
                </Text>

                <TextInput
                    name="confirmOrgName"
                    placeholder={project.name}
                    value={confirmOrgName}
                    onChange={(e) => setConfirmOrgName(e.target.value)}
                />

                <Group position="right" spacing="xs">
                    <Button variant="outline" onClick={handleOnClose}>
                        {t(
                            'components_user_settings_delete_project_modal.cancel',
                        )}
                    </Button>

                    <Button
                        color="red"
                        disabled={
                            confirmOrgName?.toLowerCase() !==
                            project.name.toLowerCase()
                        }
                        loading={isDeleting}
                        onClick={() => handleConfirm()}
                        type="submit"
                    >
                        {t(
                            'components_user_settings_delete_project_modal.delete',
                        )}
                    </Button>
                </Group>
            </Stack>
        </Modal>
    );
};
