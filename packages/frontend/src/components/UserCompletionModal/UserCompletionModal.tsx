import {
    CompleteUserSchema,
    LightdashMode,
    getEmailDomain,
    validateOrganizationEmailDomains,
    type CompleteUserArgs,
} from '@lightdash/common';
import {
    Box,
    Button,
    Checkbox,
    Modal,
    Select,
    Stack,
    Text,
    TextInput,
    Title,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import shuffle from 'lodash/shuffle';
import { zodResolver } from 'mantine-form-zod-resolver';
import { useEffect, useMemo, type FC } from 'react';
import { useTranslation } from 'react-i18next';

import { useUserCompleteMutation } from '../../hooks/user/useUserCompleteMutation';
import useApp from '../../providers/App/useApp';

const UserCompletionModal: FC = () => {
    const { health, user } = useApp();
    const { t } = useTranslation();

    const jobTitles = [
        ...shuffle([
            t('components_user_completion_modal.roles.role_1'),
            t('components_user_completion_modal.roles.role_2'),
            t('components_user_completion_modal.roles.role_3'),
            t('components_user_completion_modal.roles.role_4'),
            t('components_user_completion_modal.roles.role_5'),
            t('components_user_completion_modal.roles.role_6'),
            t('components_user_completion_modal.roles.role_7'),
            t('components_user_completion_modal.roles.role_8'),
            t('components_user_completion_modal.roles.role_9'),
            t('components_user_completion_modal.roles.role_10'),
            t('components_user_completion_modal.roles.role_11'),
            t('components_user_completion_modal.roles.role_12'),
        ]),
        t('components_user_completion_modal.roles.role_13'),
    ];

    const canEnterOrganizationName = user.data?.organizationName === '';

    const validate = zodResolver(
        canEnterOrganizationName
            ? CompleteUserSchema
            : // User is not creating org, just accepting invite
              // They cannot input org name so don't validate it for backwards compat reasons
              CompleteUserSchema.omit({ organizationName: true }),
    );

    const form = useForm<CompleteUserArgs>({
        initialValues: {
            organizationName: '',
            jobTitle: '',
            enableEmailDomainAccess: false,
            isMarketingOptedIn: true,
            isTrackingAnonymized: false,
        },
        validate,
    });

    const { isLoading, mutate, isSuccess } = useUserCompleteMutation();

    const handleSubmit = form.onSubmit((data) => {
        if (user.data?.organizationName) {
            const { organizationName, ...rest } = data;
            mutate(rest);
        } else {
            mutate(data);
        }
    });

    const { setFieldValue } = form;

    const isValidOrganizationDomain = useMemo(() => {
        if (!user.data?.email) return false;

        return !validateOrganizationEmailDomains([
            getEmailDomain(user.data.email),
        ]);
    }, [user.data?.email]);

    const canEnableEmailDomainAccess =
        canEnterOrganizationName && isValidOrganizationDomain;

    useEffect(() => {
        if (!user.data) return;
        setFieldValue('organizationName', user.data.organizationName);
    }, [setFieldValue, user.data]);

    useEffect(() => {
        if (!canEnableEmailDomainAccess) return;
        setFieldValue('enableEmailDomainAccess', true);
    }, [canEnableEmailDomainAccess, setFieldValue]);

    useEffect(() => {
        // Tracking is disabled, we complete the user tracking with default values
        if (
            health.data?.rudder.writeKey === undefined &&
            !isLoading &&
            user.data &&
            !user.data.isSetupComplete
        ) {
            mutate({
                organizationName: user.data.organizationName,
                jobTitle: 'Other',
                enableEmailDomainAccess: false,
                isMarketingOptedIn: false,
                isTrackingAnonymized: true,
            });
        }
    }, [health.data?.rudder.writeKey, isLoading, mutate, user.data]);

    if (
        !user.data ||
        user.data.isSetupComplete ||
        health.data?.rudder.writeKey === undefined
    ) {
        return null;
    }

    return (
        <>
            <Modal
                opened={!isSuccess}
                size="md"
                onClose={() => {}}
                withCloseButton={false}
                centered
                title={
                    <Box ta="center">
                        <Title order={4}>
                            {t('components_user_completion_modal.title.part_1')}
                        </Title>
                        <Text ta="center" c="gray.6">
                            {t('components_user_completion_modal.title.part_2')}
                        </Text>
                    </Box>
                }
                styles={{
                    title: {
                        width: '100%',
                    },
                }}
            >
                <Stack>
                    <form name="complete_user" onSubmit={handleSubmit}>
                        <Stack>
                            {canEnterOrganizationName && (
                                <TextInput
                                    label={t(
                                        'components_user_completion_modal.form.organization_name.label',
                                    )}
                                    placeholder={t(
                                        'components_user_completion_modal.form.organization_name.placeholder',
                                    )}
                                    disabled={isLoading}
                                    required
                                    {...form.getInputProps('organizationName')}
                                />
                            )}
                            <Select
                                withinPortal
                                label={t(
                                    'components_user_completion_modal.form.your_role.label',
                                )}
                                disabled={isLoading}
                                data={jobTitles}
                                required
                                placeholder={t(
                                    'components_user_completion_modal.form.your_role.placeholder',
                                )}
                                {...form.getInputProps('jobTitle')}
                            />

                            <Stack spacing="xs">
                                {canEnableEmailDomainAccess && (
                                    <Checkbox
                                        label={t(
                                            'components_user_completion_modal.form.allow_users.label',
                                            {
                                                email: user.data?.email || '',
                                            },
                                        )}
                                        disabled={isLoading}
                                        {...form.getInputProps(
                                            'enableEmailDomainAccess',
                                            { type: 'checkbox' },
                                        )}
                                    />
                                )}

                                <Checkbox
                                    label={t(
                                        'components_user_completion_modal.form.keep_updated.label',
                                    )}
                                    disabled={isLoading}
                                    {...form.getInputProps(
                                        'isMarketingOptedIn',
                                        {
                                            type: 'checkbox',
                                        },
                                    )}
                                />

                                {health.data?.mode !==
                                    LightdashMode.CLOUD_BETA && (
                                    <Checkbox
                                        label={t(
                                            'components_user_completion_modal.form.usage_data.label',
                                        )}
                                        disabled={isLoading}
                                        {...form.getInputProps(
                                            'isTrackingAnonymized',
                                            {
                                                type: 'checkbox',
                                            },
                                        )}
                                    />
                                )}
                            </Stack>
                            <Button
                                size="xs"
                                type="submit"
                                loading={isLoading}
                                disabled={
                                    !(
                                        form.values.organizationName &&
                                        form.values.jobTitle
                                    )
                                }
                            >
                                {t(
                                    'components_user_completion_modal.form.next',
                                )}
                            </Button>
                        </Stack>
                    </form>
                </Stack>
            </Modal>
        </>
    );
};

const UserCompletionModalWithUser = () => {
    const { user } = useApp();

    if (!user.isSuccess) {
        return null;
    }

    return <UserCompletionModal />;
};

export default UserCompletionModalWithUser;
