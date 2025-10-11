import { Group, Stack, Title } from '@mantine/core';
import { IconIdBadge2 } from '@tabler/icons-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';

import { type RoleWithScopes } from '@lightdash/common';
import { EmptyState } from '../../../components/common/EmptyState';
import MantineIcon from '../../../components/common/MantineIcon';
import PageSpinner from '../../../components/PageSpinner';
import { AddRoleButton } from '../../features/customRoles/components/AddRoleButton';
import { CustomRolesTable } from '../../features/customRoles/CustomRolesTable';
import { DuplicateRoleModal } from '../../features/customRoles/DuplicateRoleModal';
import { useCustomRoles } from '../../features/customRoles/useCustomRoles';

export const CustomRoles = () => {
    const { t } = useTranslation();

    const navigate = useNavigate();
    const { listRoles, deleteRole, getAllRoles, duplicateRole } =
        useCustomRoles();
    const [isDuplicateModalOpen, setIsDuplicateModalOpen] = useState(false);

    const handleEditRole = (role: RoleWithScopes) => {
        void navigate(`/generalSettings/customRoles/${role.roleUuid}`);
    };

    const handleDeleteRole = (uuid: string) => {
        deleteRole.mutate(uuid);
    };

    const handleDuplicateRole = async (data: {
        roleId: string;
        name: string;
        description: string;
    }) => {
        const result = await duplicateRole.mutateAsync(data);
        setIsDuplicateModalOpen(false);
        void navigate(`/generalSettings/customRoles/${result.roleUuid}`);
    };

    if (listRoles.isLoading) {
        return <PageSpinner />;
    }

    const hasRoles = (listRoles?.data?.length ?? 0) > 0;

    return (
        <Stack mb="lg">
            {hasRoles ? (
                <>
                    <Group position="apart">
                        <Title order={5}>
                            {t('pages_custom_roles.custom_roles')}
                        </Title>
                        <AddRoleButton
                            onClickDuplicate={() =>
                                setIsDuplicateModalOpen(true)
                            }
                            size="xs"
                        />
                    </Group>
                    <CustomRolesTable
                        roles={listRoles?.data ?? []}
                        onDelete={handleDeleteRole}
                        onEdit={handleEditRole}
                        isDeleting={deleteRole.isLoading}
                    />
                </>
            ) : (
                <EmptyState
                    icon={
                        <MantineIcon
                            icon={IconIdBadge2}
                            color="gray.6"
                            stroke={1}
                            size="5xl"
                        />
                    }
                    title={t('pages_custom_roles.no_custom_roles')}
                    description={t(
                        'pages_custom_roles.no_custom_roles_description',
                    )}
                >
                    <AddRoleButton
                        onClickDuplicate={() => setIsDuplicateModalOpen(true)}
                        size="md"
                    />
                </EmptyState>
            )}

            <DuplicateRoleModal
                isOpen={isDuplicateModalOpen}
                onClose={() => setIsDuplicateModalOpen(false)}
                onSubmit={handleDuplicateRole}
                isSubmitting={duplicateRole.isLoading}
                roles={getAllRoles.data || []}
            />
        </Stack>
    );
};
