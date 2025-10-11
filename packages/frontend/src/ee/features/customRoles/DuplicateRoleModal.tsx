import {
    Button,
    Group,
    Modal,
    Select,
    Stack,
    TextInput,
    Textarea,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { type FC, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { type Role, type RoleWithScopes } from '@lightdash/common';
import startCase from 'lodash/startCase';
import { validateRoleName } from './utils/roleValidation';

type Props = {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (data: {
        roleId: string;
        name: string;
        description: string;
    }) => Promise<void>;
    isSubmitting?: boolean;
    roles: Role[] | RoleWithScopes[];
};

type FormData = {
    roleId: string;
    name: string;
    description: string;
};

export const DuplicateRoleModal: FC<Props> = ({
    isOpen,
    onClose,
    onSubmit,
    isSubmitting = false,
    roles,
}) => {
    const { t } = useTranslation();

    const form = useForm<FormData>({
        initialValues: {
            roleId: '',
            name: '',
            description: '',
        },
        validate: {
            name: validateRoleName,
            roleId: (value) => {
                if (!value) {
                    return t(
                        'features_custom_roles_duplicate_modal.please_select_role_to_duplicate',
                    );
                }
                return null;
            },
        },
    });

    const rolesSelectData = useMemo(() => {
        const systemRoles = roles
            .filter((role) => role.ownerType === 'system')
            .map((role) => ({
                value: role.roleUuid,
                label: startCase(role.name),
                group: 'System roles',
            }));

        const customRoles = roles
            .filter((role) => role.ownerType === 'user')
            .map((role) => ({
                value: role.roleUuid,
                label: role.name,
                group: 'Custom roles',
            }));

        return [...systemRoles, ...customRoles];
    }, [roles]);

    const handleRoleChange = (value: string) => {
        const selectedRole = roles.find((role) => role.roleUuid === value);
        if (selectedRole) {
            form.setFieldValue('name', `Copy of: ${selectedRole.name}`);
        }
        form.setFieldValue('roleId', value);
    };

    const handleSubmit = async (values: FormData) => {
        await onSubmit(values);
        form.reset();
    };

    const handleClose = () => {
        form.reset();
        onClose();
    };

    const getTitle = () => {
        if (!form.values.roleId)
            return t('features_custom_roles_duplicate_modal.duplicate_role');

        const roleName = rolesSelectData.find(
            (role) => role.value === form.values.roleId,
        )?.label;

        return t('features_custom_roles_duplicate_modal.duplicate_role_name', {
            roleName,
        });
    };

    return (
        <Modal
            opened={isOpen}
            onClose={handleClose}
            title={getTitle()}
            size="md"
        >
            <form onSubmit={form.onSubmit(handleSubmit)}>
                <Stack>
                    <Select
                        label={t(
                            'features_custom_roles_duplicate_modal.role.label',
                        )}
                        placeholder={t(
                            'features_custom_roles_duplicate_modal.role.placeholder',
                        )}
                        searchable
                        nothingFound={t(
                            'features_custom_roles_duplicate_modal.role.nothingFound',
                        )}
                        data={rolesSelectData}
                        required
                        disabled={isSubmitting}
                        value={form.values.roleId}
                        onChange={handleRoleChange}
                        error={form.errors.roleId}
                    />
                    <TextInput
                        label={t(
                            'features_custom_roles_duplicate_modal.name.label',
                        )}
                        placeholder={t(
                            'features_custom_roles_duplicate_modal.name.placeholder',
                        )}
                        disabled={isSubmitting}
                        {...form.getInputProps('name')}
                    />
                    <Textarea
                        label={t(
                            'features_custom_roles_duplicate_modal.description.label',
                        )}
                        placeholder={t(
                            'features_custom_roles_duplicate_modal.description.placeholder',
                        )}
                        rows={3}
                        disabled={isSubmitting}
                        {...form.getInputProps('description')}
                    />
                    <Group position="right" mt="md">
                        <Button
                            variant="outline"
                            onClick={handleClose}
                            disabled={isSubmitting}
                        >
                            {t('features_custom_roles_duplicate_modal.cancel')}
                        </Button>
                        <Button type="submit" loading={isSubmitting}>
                            {t(
                                'features_custom_roles_duplicate_modal.duplicate',
                            )}
                        </Button>
                    </Group>
                </Stack>
            </form>
        </Modal>
    );
};
