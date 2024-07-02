import {
    getEmailDomain,
    LightdashMode,
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
import { useEffect, useMemo, type FC } from 'react';
import { useTranslation } from 'react-i18next';

import { useUserCompleteMutation } from '../../hooks/user/useUserCompleteMutation';
import { useApp } from '../../providers/AppProvider';

const jobTitles = [
    ...shuffle([
        'Data/Analytics Leader (manager, director, etc.)',
        'Data Scientist',
        'Data Analyst',
        'Data Engineer',
        'Analytics Engineer',
        'Software Engineer',
        'Sales',
        'Marketing',
        'Product',
        'Operations',
        'Customer Service',
        'Student',
    ]),
    'Other',
];

const UserCompletionModal: FC = () => {
    const { health, user } = useApp();
    const { t } = useTranslation();

    const form = useForm<CompleteUserArgs>({
        initialValues: {
            organizationName: '',
            jobTitle: '',
            enableEmailDomainAccess: false,
            isMarketingOptedIn: true,
            isTrackingAnonymized: false,
        },
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

    const canEnterOrganizationName = user.data?.organizationName === '';

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

    if (!user.data || user.data.isSetupComplete) {
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

export default UserCompletionModal;
