import { type ApiError, type PullRequestCreated } from '@lightdash/common';
import {
    Button,
    Group,
    Modal,
    Select,
    Stack,
    Text,
    Title,
    type ModalProps,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconArrowRight } from '@tabler/icons-react';
import { useMutation } from '@tanstack/react-query';
import React, { type FC } from 'react';
import { useTranslation } from 'react-i18next';

import { lightdashApi } from '../../api';
import useToaster from '../../hooks/toaster/useToaster';

const createCustomMetricsPullRequest = async (
    projectUuid: string,
    data: {
        customMetrics: string[];
        quoteChar: `"` | `'`;
    },
) =>
    lightdashApi<any>({
        url: `/projects/${projectUuid}/git-integration/pull-requests/custom-metrics`,
        method: 'POST',
        body: JSON.stringify(data),
    });

const useCreateCustomMetricsPullRequest = (projectUuid: string) => {
    const { t } = useTranslation();
    const { showToastSuccess, showToastApiError } = useToaster();

    return useMutation<
        PullRequestCreated,
        ApiError,
        {
            customMetrics: string[];
            quoteChar: `"` | `'`;
        }
    >((data) => createCustomMetricsPullRequest(projectUuid, data), {
        mutationKey: ['git-integration', 'custom-metrics-pull-request'],
        retry: false,
        onSuccess: async (pullRequest) => {
            showToastSuccess({
                title: `${t('components_custom_sql_panel.toast.success')} '${
                    pullRequest.prTitle
                }'`,
                action: {
                    children: 'Open Pull Request',
                    icon: IconArrowRight,
                    onClick: () => {
                        window.open(pullRequest.prUrl, '_blank');
                    },
                },
            });
        },
        onError: ({ error }) => {
            showToastApiError({
                title: t('components_custom_sql_panel.toast.error'),
                apiError: error,
            });
        },
    });
};

type Props = Pick<ModalProps, 'opened' | 'onClose'> & {
    projectUuid: string;
    customMetrics: string[];
};

export const CreateCustomMetricsPullRequestModal: FC<Props> = ({
    opened,
    onClose,
    projectUuid,
    customMetrics,
}) => {
    const { t } = useTranslation();
    const { mutateAsync, isLoading: isSaving } =
        useCreateCustomMetricsPullRequest(projectUuid);
    const form = useForm<{
        quoteChar: `"` | `'`;
    }>({
        initialValues: {
            quoteChar: `"`,
        },
    });

    return (
        <Modal
            title={
                <Title order={4}>
                    {t('components_custom_sql_panel.modal_create.title')}
                </Title>
            }
            opened={opened}
            onClose={onClose}
        >
            <form
                onSubmit={form.onSubmit(async (formData) => {
                    await mutateAsync({
                        ...formData,
                        customMetrics,
                    });
                    onClose();
                })}
            >
                <Stack spacing="xs">
                    <Text>
                        {t(
                            'components_custom_sql_panel.modal_create.content.part_1',
                        )}{' '}
                        {customMetrics.length}{' '}
                        {t(
                            'components_custom_sql_panel.modal_create.content.part_2',
                        )}
                    </Text>

                    <Select
                        required
                        label={t(
                            'components_custom_sql_panel.modal_create.select.label',
                        )}
                        size="xs"
                        disabled={isSaving}
                        data={[`"`, `'`].map((char) => ({
                            value: char,
                            label: char,
                        }))}
                        withinPortal
                        {...form.getInputProps('quoteChar')}
                    />

                    <Group position="right" spacing="xs" mt="sm">
                        <Button
                            size="xs"
                            variant="outline"
                            color="dark"
                            onClick={onClose}
                            disabled={isSaving}
                        >
                            {t(
                                'components_custom_sql_panel.modal_create.cancel',
                            )}
                        </Button>

                        <Button size="xs" type="submit" disabled={isSaving}>
                            {t(
                                'components_custom_sql_panel.modal_create.create',
                            )}
                        </Button>
                    </Group>
                </Stack>
            </form>
        </Modal>
    );
};
