import { Group, Paper, Title } from '@mantine/core';
import { IconIdBadge2 } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';

import MantineIcon from '../../../components/common/MantineIcon';
import { RoleBuilder } from '../../features/customRoles/components/RoleBuilder';
import { useCustomRoles } from '../../features/customRoles/useCustomRoles';

export const CustomRoleCreate = () => {
    const { t } = useTranslation();

    const navigate = useNavigate();
    const { createRole } = useCustomRoles();

    const handleCreateRole = async (values: {
        name: string;
        description: string;
        scopes: string[];
    }) => {
        await createRole.mutateAsync({
            name: values.name,
            description: values.description || undefined,
            scopes: values.scopes,
        });
        void navigate('/generalSettings/customRoles');
    };

    const initialValues = {
        name: '',
        description: '',
        scopes: [],
    };

    return (
        <Paper h="87vh" shadow="sm" withBorder p="md">
            <Title order={4}>
                <Group>
                    <MantineIcon icon={IconIdBadge2} />{' '}
                    {t('pages_custom_roles_create.title')}
                </Group>
            </Title>

            <RoleBuilder
                initialValues={initialValues}
                onSubmit={handleCreateRole}
                isWorking={createRole.isLoading}
                mode="create"
            />
        </Paper>
    );
};
