import {
    type GroupWithMembers,
    type ProjectGroupAccess,
    type UpdateProjectGroupAccess,
} from '@lightdash/common';
import { ActionIcon, Group, Text } from '@mantine/core';
import { IconEdit, IconTrash } from '@tabler/icons-react';
import { useState, type FC } from 'react';
import { useTranslation } from 'react-i18next';

import MantineIcon from '../../../components/common/MantineIcon';
import useToaster from '../../../hooks/toaster/useToaster';
import {
    useRemoveProjectGroupAccessMutation,
    useUpdateProjectGroupAccessMutation,
} from '../hooks/useProjectGroupAccess';
import EditProjectGroupAccessModal from './EditProjectGroupAccessModal';
import RevokeProjectGroupAccessModal from './RevokeProjectGroupAccessModal';

type ProjectGroupAccessItemProps = {
    group: GroupWithMembers;
    access: ProjectGroupAccess;
};

const ProjectGroupAccessItem: FC<ProjectGroupAccessItemProps> = ({
    group,
    access,
}) => {
    const { t } = useTranslation();

    const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

    const { showToastSuccess } = useToaster();

    const { mutateAsync: removeProjectGroupAccess } =
        useRemoveProjectGroupAccessMutation();

    const { mutateAsync: updateProjectGroupAccess, isLoading: isSubmitting } =
        useUpdateProjectGroupAccessMutation();

    const handleUpdateProjectGroupAccess = async (
        updatedAccess: UpdateProjectGroupAccess,
    ) => {
        await updateProjectGroupAccess(updatedAccess);
        showToastSuccess({
            title: t('features_project_group_access_item.toast.updated'),
        });
        setIsEditDialogOpen(false);
    };

    const handleRemoveProjectGroupAccess = async () => {
        await removeProjectGroupAccess({
            projectUuid: access.projectUuid,
            groupUuid: access.groupUuid,
        });
        showToastSuccess({
            title: t('features_project_group_access_item.toast.removed'),
        });
        setIsDeleteDialogOpen(false);
    };

    return (
        <>
            <tr key={access.groupUuid}>
                <td>
                    <Text fw={500}>{group.name}</Text>
                </td>
                <td>{access.role}</td>
                <td>
                    <Group position="right" spacing="sm">
                        <ActionIcon
                            variant="outline"
                            color="blue"
                            onClick={() => setIsEditDialogOpen(true)}
                        >
                            <MantineIcon icon={IconEdit} />
                        </ActionIcon>

                        <ActionIcon
                            variant="outline"
                            color="red"
                            onClick={() => setIsDeleteDialogOpen(true)}
                        >
                            <MantineIcon icon={IconTrash} />
                        </ActionIcon>
                    </Group>
                </td>
            </tr>

            {isEditDialogOpen && (
                <EditProjectGroupAccessModal
                    opened
                    isSubmitting={isSubmitting}
                    group={group}
                    access={access}
                    onUpdate={handleUpdateProjectGroupAccess}
                    onClose={() => setIsEditDialogOpen(false)}
                />
            )}

            {isDeleteDialogOpen && (
                <RevokeProjectGroupAccessModal
                    group={group}
                    onDelete={() => handleRemoveProjectGroupAccess()}
                    onClose={() => setIsDeleteDialogOpen(false)}
                />
            )}
        </>
    );
};

export default ProjectGroupAccessItem;
