import {
    ProjectMemberRole,
    type CreateProjectGroupAccess,
    type GroupWithMembers,
} from '@lightdash/common';
import { Box, Button, Group, Modal, Select, Text, Title } from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconUsersGroup } from '@tabler/icons-react';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';

import MantineIcon from '../../../components/common/MantineIcon';
import SuboptimalState from '../../../components/common/SuboptimalState/SuboptimalState';
import { TrackPage } from '../../../providers/Tracking/TrackingProvider';
import { CategoryName, PageName, PageType } from '../../../types/Events';

interface AddProjectGroupAccessModalProps {
    projectUuid: string;
    isSubmitting: boolean;
    totalNumberOfGroups: number;
    availableGroups: GroupWithMembers[];
    organizationRoles: { value: string; label: string; group: string }[];
    onSubmit: (formData: CreateProjectGroupAccess) => void;
    onClose: () => void;
}
type FormData = {
    projectUuid: string;
    groupUuid: string;
    role: string;
};
const AddProjectGroupAccessModal: FC<AddProjectGroupAccessModalProps> = ({
    projectUuid,
    isSubmitting,
    totalNumberOfGroups,
    availableGroups,
    organizationRoles,
    onSubmit,
    onClose,
}) => {
    const { t } = useTranslation();

    const defaultRole =
        organizationRoles?.find(
            (role) => role.value === ProjectMemberRole.VIEWER,
        )?.value ||
        organizationRoles?.[0]?.value ||
        ProjectMemberRole.VIEWER;

    const form = useForm<FormData>({
        initialValues: {
            projectUuid,
            groupUuid: '',
            role: defaultRole,
        },
    });

    const handleSubmit = (formData: FormData) => {
        onSubmit(formData as CreateProjectGroupAccess);
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
                        {t('features_project_group_access_add_modal.title')}
                    </Title>
                </Group>
            }
            size="lg"
        >
            <TrackPage
                name={PageName.PROJECT_ADD_GROUP_ACCESS}
                type={PageType.MODAL}
                category={CategoryName.SETTINGS}
            >
                {availableGroups.length === 0 ? (
                    <Box mb="lg">
                        <SuboptimalState
                            icon={IconUsersGroup}
                            title={t(
                                'features_project_group_access_add_modal.no_groups_available.title',
                            )}
                            description={
                                totalNumberOfGroups ? (
                                    t(
                                        'features_project_group_access_add_modal.no_groups_available.description_of_groups',
                                    )
                                ) : (
                                    <Text w="70%">
                                        {t(
                                            'features_project_group_access_add_modal.no_groups_available.description.part_1',
                                        )}{' '}
                                        <Text span fw={500}>
                                            {t(
                                                'features_project_group_access_add_modal.no_groups_available.description.part_2',
                                            )}{' '}
                                        </Text>{' '}
                                        {t(
                                            'features_project_group_access_add_modal.no_groups_available.description.part_3',
                                        )}
                                    </Text>
                                )
                            }
                        />
                    </Box>
                ) : (
                    <form
                        name="add_project_group_access"
                        onSubmit={form.onSubmit(handleSubmit)}
                    >
                        <Group align="flex-end" spacing="xs">
                            <Select
                                name="groupUuid"
                                withinPortal
                                label={t(
                                    'features_project_group_access_add_modal.form.select_group.label',
                                )}
                                placeholder={t(
                                    'features_project_group_access_add_modal.form.select_group.placeholder',
                                )}
                                nothingFound={t(
                                    'features_project_group_access_add_modal.form.select_group.nothingFound',
                                )}
                                searchable
                                required
                                data={
                                    availableGroups.map((group) => ({
                                        value: group.uuid,
                                        label: group.name,
                                    })) ?? []
                                }
                                {...form.getInputProps('groupUuid')}
                                sx={{ flexGrow: 1 }}
                            />
                            <Select
                                data={organizationRoles}
                                required
                                placeholder={t(
                                    'features_project_group_access_add_modal.form.select_role.placeholder',
                                )}
                                dropdownPosition="bottom"
                                withinPortal
                                {...form.getInputProps('role')}
                            />

                            <Button disabled={isSubmitting} type="submit">
                                {t(
                                    'features_project_group_access_add_modal.form.give_access',
                                )}
                            </Button>
                        </Group>
                    </form>
                )}
            </TrackPage>
        </Modal>
    );
};

export default AddProjectGroupAccessModal;
