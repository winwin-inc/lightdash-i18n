import {
    FeatureFlags,
    type CreateUserAttribute,
    type UserAttribute,
} from '@lightdash/common';
import {
    ActionIcon,
    Button,
    Group,
    Modal,
    Select,
    Stack,
    Switch,
    Text,
    Textarea,
    TextInput,
    Title,
    Tooltip,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import {
    IconInfoCircle,
    IconTrash,
    IconUserPlus,
    IconUsersPlus,
} from '@tabler/icons-react';
import { useEffect, useState, type FC } from 'react';
import { useTranslation } from 'react-i18next';

import { useFeatureFlag } from '../../../hooks/useFeatureFlagEnabled';
import { useOrganizationGroups } from '../../../hooks/useOrganizationGroups';
import { useOrganizationUsers } from '../../../hooks/useOrganizationUsers';
import {
    useCreateUserAtributesMutation,
    useUpdateUserAtributesMutation,
} from '../../../hooks/useUserAttributes';
import MantineIcon from '../../common/MantineIcon';

const UserAttributeModal: FC<{
    opened: boolean;
    userAttribute?: UserAttribute;
    allUserAttributes: UserAttribute[];
    onClose: () => void;
}> = ({ opened, userAttribute, allUserAttributes, onClose }) => {
    const { t } = useTranslation();
    const userGroupsFeatureFlagQuery = useFeatureFlag(
        FeatureFlags.UserGroupsEnabled,
    );

    const form = useForm<CreateUserAttribute>({
        initialValues: {
            name: userAttribute?.name || '',
            description: userAttribute?.description,
            users: userAttribute?.users || [],
            groups: userAttribute?.groups || [],
            attributeDefault: userAttribute?.attributeDefault || null,
        },
        validate: {
            name: (value: string) => {
                if (!/^[a-z_][a-z0-9_]*$/.test(value)) {
                    return t(
                        'components_user_settings_attributes_panel_create.validate.name',
                    );
                }
                if (
                    allUserAttributes.some(
                        (attr) =>
                            attr.name === value &&
                            attr.uuid !== userAttribute?.uuid,
                    )
                ) {
                    return t(
                        'components_user_settings_attributes_panel_create.validate.same_name',
                    );
                }
                return null;
            },
            users: (value: { userUuid: string; value: string }[]) => {
                if (
                    value.reduceRight(
                        (acc, user, index) =>
                            acc ||
                            value.some(
                                (otherUser, otherIndex) =>
                                    index !== otherIndex &&
                                    user.userUuid === otherUser.userUuid,
                            ),
                        false,
                    )
                ) {
                    return t(
                        'components_user_settings_attributes_panel_create.validate.duplicate_users',
                    );
                }
                return null;
            },
            groups: (value: { groupUuid: string; value: string }[]) => {
                if (
                    value.reduceRight(
                        (acc, group, index) =>
                            acc ||
                            value.some(
                                (otherGroup, otherIndex) =>
                                    index !== otherIndex &&
                                    group.groupUuid === otherGroup.groupUuid,
                            ),
                        false,
                    )
                ) {
                    return t(
                        'components_user_settings_attributes_panel_create.validate.duplicate_groups',
                    );
                }
                return null;
            },
        },
    });
    const [inputError, setInputError] = useState<string | undefined>();
    const { mutate: createUserAttribute } = useCreateUserAtributesMutation();
    const { mutate: updateUserAttribute } = useUpdateUserAtributesMutation(
        userAttribute?.uuid,
    );
    const [checked, setChecked] = useState(false);

    useEffect(() => {
        //Reset checked on edit
        setChecked(
            userAttribute?.attributeDefault !== undefined &&
                userAttribute?.attributeDefault !== null,
        );
    }, [userAttribute?.attributeDefault]);

    const handleClose = () => {
        form.reset();
        setInputError(undefined);
        setChecked(false);
        if (onClose) onClose();
    };
    const handleSubmit = async (data: CreateUserAttribute) => {
        if (userAttribute?.uuid) {
            await updateUserAttribute(data);
        } else {
            await createUserAttribute(data);
        }
        handleClose();
    };

    if (userGroupsFeatureFlagQuery.isError) {
        console.error(userGroupsFeatureFlagQuery.error);
        throw new Error('Error fetching user groups feature flag');
    }

    const isGroupManagementEnabled =
        userGroupsFeatureFlagQuery.isSuccess &&
        userGroupsFeatureFlagQuery.data.enabled;

    const { data: orgUsers } = useOrganizationUsers();
    const { data: groups } = useOrganizationGroups(
        {},
        { enabled: isGroupManagementEnabled },
    );

    return (
        <Modal
            opened={opened}
            onClose={handleClose}
            title={
                <Title order={4}>
                    {userAttribute
                        ? t(
                              'components_user_settings_attributes_panel_create.title.update',
                          )
                        : t(
                              'components_user_settings_attributes_panel_create.title.add',
                          )}
                </Title>
            }
            yOffset={65}
            size="lg"
            styles={(theme) => ({
                header: { borderBottom: `1px solid ${theme.colors.gray[4]}` },
                body: { padding: 0 },
            })}
        >
            <form
                name="add_user_attribute"
                onSubmit={form.onSubmit((values: CreateUserAttribute) =>
                    handleSubmit(values),
                )}
            >
                <Stack spacing="xs" p="md">
                    <TextInput
                        name="name"
                        label={t(
                            'components_user_settings_attributes_panel_create.form.name.label',
                        )}
                        placeholder={t(
                            'components_user_settings_attributes_panel_create.form.name.placeholder',
                        )}
                        required
                        {...form.getInputProps('name')}
                    />
                    <Text color="red" size="sm">
                        {inputError}
                    </Text>

                    <Textarea
                        name="description"
                        label={t(
                            'components_user_settings_attributes_panel_create.form.description.label',
                        )}
                        placeholder={t(
                            'components_user_settings_attributes_panel_create.form.description.placeholder',
                        )}
                        {...form.getInputProps('description')}
                    />
                    <Stack spacing="xxs">
                        <Group spacing="xs">
                            <Text fw={500}>
                                {t(
                                    'components_user_settings_attributes_panel_create.form.default_value.label',
                                )}
                            </Text>

                            <Tooltip
                                variant="xs"
                                position="right"
                                multiline
                                maw={200}
                                label={t(
                                    'components_user_settings_attributes_panel_create.form.default_value.tooltip',
                                )}
                            >
                                <MantineIcon
                                    color="gray.6"
                                    icon={IconInfoCircle}
                                />
                            </Tooltip>
                        </Group>

                        <Group h={36}>
                            <Switch
                                checked={checked}
                                onChange={(event) => {
                                    const isChecked =
                                        event.currentTarget.checked;
                                    setChecked(isChecked);
                                    if (!isChecked)
                                        form.setFieldValue(
                                            'attributeDefault',
                                            null,
                                        );
                                }}
                            />
                            {checked && (
                                <TextInput
                                    size="xs"
                                    name={`attributeDefault`}
                                    placeholder={t(
                                        'components_user_settings_attributes_panel_create.form.value.placeholder',
                                    )}
                                    required
                                    {...form.getInputProps('attributeDefault')}
                                />
                            )}
                        </Group>
                    </Stack>
                    <Stack>
                        <Stack spacing="xs">
                            <Text fw={500}>
                                {t(
                                    'components_user_settings_attributes_panel_create.assign_to_users',
                                )}
                            </Text>
                            {!form.isValid('users') && (
                                <Text color="red" size="xs">
                                    {form.errors.users}
                                </Text>
                            )}

                            {form.values.users?.map((user, index) => {
                                return (
                                    <Group key={index}>
                                        <Select
                                            size="xs"
                                            sx={{ flexGrow: 1 }}
                                            label={
                                                index === 0
                                                    ? t(
                                                          'components_user_settings_attributes_panel_create.form.email.label',
                                                      )
                                                    : undefined
                                            }
                                            name={`users.${index}.userUuid`}
                                            placeholder={t(
                                                'components_user_settings_attributes_panel_create.form.email.placeholder',
                                            )}
                                            required
                                            searchable
                                            {...form.getInputProps(
                                                `users.${index}.userUuid`,
                                            )}
                                            data={
                                                orgUsers?.map((orgUser) => ({
                                                    value: orgUser.userUuid,
                                                    label: orgUser.email,
                                                })) || []
                                            }
                                        />

                                        <TextInput
                                            size="xs"
                                            sx={{ flexGrow: 1 }}
                                            label={
                                                index === 0
                                                    ? t(
                                                          'components_user_settings_attributes_panel_create.form.value.label',
                                                      )
                                                    : undefined
                                            }
                                            name={`users.${index}.value`}
                                            placeholder={t(
                                                'components_user_settings_attributes_panel_create.form.value.placeholder',
                                            )}
                                            required
                                            {...form.getInputProps(
                                                `users.${index}.value`,
                                            )}
                                        />
                                        <ActionIcon
                                            mt={index === 0 ? 20 : undefined}
                                            color="red"
                                            variant="outline"
                                            onClick={() => {
                                                form.setFieldValue(
                                                    'users',
                                                    form.values.users.filter(
                                                        (_, i) => i !== index,
                                                    ),
                                                );
                                            }}
                                        >
                                            <MantineIcon icon={IconTrash} />
                                        </ActionIcon>
                                    </Group>
                                );
                            })}
                            <Button
                                size="xs"
                                variant="default"
                                sx={{ alignSelf: 'flex-start' }}
                                leftIcon={<MantineIcon icon={IconUserPlus} />}
                                onClick={() => {
                                    form.setFieldValue('users', [
                                        ...(form.values.users || []),
                                        { userUuid: '', value: '' },
                                    ]);
                                }}
                            >
                                {t(
                                    'components_user_settings_attributes_panel_create.add_user',
                                )}
                            </Button>
                        </Stack>

                        {isGroupManagementEnabled && (
                            <Stack spacing="xs">
                                <Text fw={500}>
                                    {t(
                                        'components_user_settings_attributes_panel_create.assign_to_groups',
                                    )}
                                </Text>
                                {!form.isValid('groups') && (
                                    <Text color="red" size="xs">
                                        {form.errors.groups}
                                    </Text>
                                )}
                                {form.values.groups.map((group, index) => {
                                    return (
                                        <Group key={index}>
                                            <Select
                                                size="xs"
                                                sx={{ flexGrow: 1 }}
                                                label={
                                                    index === 0
                                                        ? t(
                                                              'components_user_settings_attributes_panel_create.form.group_name.label',
                                                          )
                                                        : undefined
                                                }
                                                name={`groups.${index}.groupUuid`}
                                                placeholder={t(
                                                    'components_user_settings_attributes_panel_create.form.group_name.placeholder',
                                                )}
                                                required
                                                searchable
                                                {...form.getInputProps(
                                                    `groups.${index}.groupUuid`,
                                                )}
                                                data={
                                                    groups?.map(
                                                        (groupInfo) => ({
                                                            value: groupInfo.uuid,
                                                            label: groupInfo.name,
                                                        }),
                                                    ) || []
                                                }
                                            />

                                            <TextInput
                                                size="xs"
                                                sx={{ flexGrow: 1 }}
                                                label={
                                                    index === 0
                                                        ? t(
                                                              'components_user_settings_attributes_panel_create.form.value.label',
                                                          )
                                                        : undefined
                                                }
                                                name={`groups.${index}.value`}
                                                placeholder={t(
                                                    'components_user_settings_attributes_panel_create.form.value.placeholder',
                                                )}
                                                required
                                                {...form.getInputProps(
                                                    `groups.${index}.value`,
                                                )}
                                            />
                                            <ActionIcon
                                                mt={
                                                    index === 0 ? 20 : undefined
                                                }
                                                color="red"
                                                variant="outline"
                                                onClick={() => {
                                                    form.setFieldValue(
                                                        'groups',
                                                        form.values.groups.filter(
                                                            (_, i) =>
                                                                i !== index,
                                                        ),
                                                    );
                                                }}
                                            >
                                                <MantineIcon icon={IconTrash} />
                                            </ActionIcon>
                                        </Group>
                                    );
                                })}
                                <Button
                                    size="xs"
                                    variant="default"
                                    sx={{ alignSelf: 'flex-start' }}
                                    leftIcon={
                                        <MantineIcon icon={IconUsersPlus} />
                                    }
                                    onClick={() => {
                                        form.insertListItem('groups', {
                                            groupUuid: '',
                                            value: '',
                                        });
                                    }}
                                >
                                    {t(
                                        'components_user_settings_attributes_panel_create.add_group',
                                    )}
                                </Button>
                            </Stack>
                        )}
                    </Stack>
                </Stack>
                <Group
                    spacing="xs"
                    position="right"
                    sx={(theme) => ({
                        position: 'sticky',
                        backgroundColor: 'white',
                        borderTop: `1px solid ${theme.colors.gray[4]}`,
                        bottom: 0,
                        zIndex: 2,
                        padding: theme.spacing.md,
                    })}
                >
                    <Button
                        onClick={() => {
                            handleClose();
                        }}
                        variant="outline"
                    >
                        {t(
                            'components_user_settings_attributes_panel_create.cancel',
                        )}
                    </Button>
                    <Button type="submit">
                        {userAttribute
                            ? t(
                                  'components_user_settings_attributes_panel_create.update',
                              )
                            : t(
                                  'components_user_settings_attributes_panel_create.add',
                              )}
                    </Button>
                </Group>
            </form>
        </Modal>
    );
};

export default UserAttributeModal;
