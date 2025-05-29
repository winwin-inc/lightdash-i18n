import {
    type CreateGroup,
    type GroupWithMembers,
    type UpdateGroupWithMembers,
} from '@lightdash/common';
import {
    Button,
    Group,
    Loader,
    Modal,
    MultiSelect,
    Stack,
    TextInput,
    Title,
    type ModalProps,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconUsersGroup } from '@tabler/icons-react';
import React, { useMemo, type FC } from 'react';
import { useTranslation } from 'react-i18next';

import {
    useGroupCreateMutation,
    useGroupUpdateMutation,
} from '../../../hooks/useOrganizationGroups';
import { useOrganizationUsers } from '../../../hooks/useOrganizationUsers';
import useApp from '../../../providers/App/useApp';
import MantineIcon from '../../common/MantineIcon';

const CreateGroupModal: FC<
    ModalProps & { isEditing?: boolean; groupToEdit?: GroupWithMembers }
> = ({ opened, onClose, isEditing, groupToEdit }) => {
    const { t } = useTranslation();
    const form = useForm<CreateGroup>({
        initialValues: {
            name: groupToEdit?.name ?? '',
            members: groupToEdit?.members ?? [],
        },
        validate: {
            name: (value: string) =>
                value.trim().length
                    ? null
                    : t(
                          'components_user_settings_groups_panel_create.validate.group_name',
                      ),
        },
    });

    const { user } = useApp();
    const { data: organizationUsers, isInitialLoading: isLoadingUsers } =
        useOrganizationUsers();

    const { mutateAsync: mutateAsyncCreateGroup, isLoading: isLoadingCreate } =
        useGroupCreateMutation();

    const { mutateAsync: mutateAsyncUpdateGroup, isLoading: isLoadingUpdate } =
        useGroupUpdateMutation();

    const handleSubmitCreate = async (data: CreateGroup) => {
        await mutateAsyncCreateGroup(data);
        form.reset();
        onClose();
    };

    const handleSubmitUpdate = async (
        data: UpdateGroupWithMembers & { uuid: string },
    ) => {
        await mutateAsyncUpdateGroup({
            name: form.isDirty('name') ? data.name : undefined,
            members: form.isDirty('members') ? data.members : undefined,
            uuid: data.uuid,
        });

        form.reset();
        onClose();
    };

    const users = useMemo(() => {
        if (organizationUsers === undefined) return [];
        return organizationUsers.map((u) => ({
            value: u.userUuid,
            label: u.email,
        }));
    }, [organizationUsers]);

    if (user.data?.ability?.cannot('manage', 'Group')) {
        return null;
    }

    const isLoading = isLoadingCreate || isLoadingUpdate;

    return (
        <Modal
            opened={opened}
            onClose={onClose}
            title={
                <Group spacing="xs">
                    <MantineIcon size="lg" icon={IconUsersGroup} />
                    <Title order={4}>
                        {isEditing
                            ? t(
                                  'components_user_settings_groups_panel_create.modal.title_edit',
                                  {
                                      name: groupToEdit?.name,
                                  },
                              )
                            : t(
                                  'components_user_settings_groups_panel_create.modal.title_create',
                              )}
                    </Title>
                </Group>
            }
            size="lg"
        >
            <form
                name="create_edit_group"
                onSubmit={form.onSubmit((values: CreateGroup) =>
                    isEditing && groupToEdit
                        ? handleSubmitUpdate({
                              ...values,
                              uuid: groupToEdit?.uuid,
                          })
                        : handleSubmitCreate(values),
                )}
            >
                <Stack>
                    <TextInput
                        label={t(
                            'components_user_settings_groups_panel_create.form.group_name.label',
                        )}
                        placeholder={t(
                            'components_user_settings_groups_panel_create.form.group_name.placeholder',
                        )}
                        required
                        w="100%"
                        disabled={isLoading}
                        {...form.getInputProps('name')}
                    />
                    <MultiSelect
                        withinPortal
                        searchable
                        clearSearchOnChange
                        clearSearchOnBlur
                        label={t(
                            'components_user_settings_groups_panel_create.form.select.label',
                        )}
                        placeholder={t(
                            'components_user_settings_groups_panel_create.form.select.placeholder',
                        )}
                        nothingFound={t(
                            'components_user_settings_groups_panel_create.form.select.nothingFound',
                        )}
                        rightSection={isLoadingUsers && <Loader size="sm" />}
                        data={users}
                        value={
                            form?.values.members?.map((v) => v.userUuid) ?? []
                        }
                        onChange={(userIds) => {
                            form?.setValues({
                                members: userIds.map((userUuid) => ({
                                    userUuid,
                                })),
                            });
                        }}
                        styles={{
                            values: {
                                maxHeight: 200,
                                overflow: 'auto',
                            },
                        }}
                        dropdownPosition="top"
                    />

                    <Button
                        disabled={isLoading || !form.isDirty()}
                        type="submit"
                        sx={{ alignSelf: 'end' }}
                    >
                        {isEditing
                            ? t(
                                  'components_user_settings_groups_panel_create.save',
                              )
                            : t(
                                  'components_user_settings_groups_panel_create.create',
                              )}
                    </Button>
                </Stack>
            </form>
        </Modal>
    );
};

export default CreateGroupModal;
