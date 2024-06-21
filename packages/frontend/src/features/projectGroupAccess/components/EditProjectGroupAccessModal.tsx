import {
    ProjectMemberRole,
    type GroupWithMembers,
    type ProjectGroupAccess,
    type UpdateProjectGroupAccess,
} from '@lightdash/common';
import { Button, Group, Modal, Select, Text, Title } from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconUsersGroup } from '@tabler/icons-react';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';

import MantineIcon from '../../../components/common/MantineIcon';
import { TrackPage } from '../../../providers/TrackingProvider';
import { CategoryName, PageName, PageType } from '../../../types/Events';

interface EditProjectGroupAccessModalProps {
    opened: boolean;
    isSubmitting: boolean;
    group: GroupWithMembers;
    access: ProjectGroupAccess;
    onClose: () => void;
    onUpdate: (access: ProjectGroupAccess) => void;
}

const EditProjectGroupAccessModal: FC<EditProjectGroupAccessModalProps> = ({
    isSubmitting,
    group,
    access,
    onClose,
    onUpdate,
}) => {
    const { t } = useTranslation();

    const form = useForm<UpdateProjectGroupAccess>({
        initialValues: {
            projectUuid: access.projectUuid,
            groupUuid: access.groupUuid,
            role: access.role,
        },
    });

    const handleSubmit = (formData: UpdateProjectGroupAccess) => {
        onUpdate(formData);
    };

    return (
        <Modal
            opened
            onClose={onClose}
            keepMounted={false}
            title={
                <Group spacing="xs">
                    <MantineIcon size="lg" icon={IconUsersGroup} />
                    <Title order={4}>
                        {t('features_project_group_access_edit_modal.title')}
                    </Title>
                </Group>
            }
            size="lg"
        >
            <TrackPage
                name={PageName.PROJECT_UPDATE_GROUP_ACCESS}
                type={PageType.MODAL}
                category={CategoryName.SETTINGS}
            >
                <form
                    name="update_project_group_access"
                    onSubmit={form.onSubmit(handleSubmit)}
                >
                    <Group spacing="xs">
                        <Text style={{ flexGrow: 1 }} fw={600}>
                            {group.name}
                        </Text>

                        <Select
                            data={Object.values(ProjectMemberRole).map(
                                (orgMemberRole) => ({
                                    value: orgMemberRole,
                                    label: orgMemberRole.replace('_', ' '),
                                }),
                            )}
                            required
                            placeholder={t(
                                'features_project_group_access_edit_modal.form.select_role.placeholder',
                            )}
                            dropdownPosition="bottom"
                            withinPortal
                            {...form.getInputProps('role')}
                        />

                        <Button disabled={isSubmitting} type="submit">
                            {t(
                                'features_project_group_access_edit_modal.form.update_access',
                            )}
                        </Button>
                    </Group>
                </form>
            </TrackPage>
        </Modal>
    );
};

export default EditProjectGroupAccessModal;
