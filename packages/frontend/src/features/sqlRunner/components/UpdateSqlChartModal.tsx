import {
    Button,
    Group,
    Modal,
    Stack,
    Text,
    Textarea,
    TextInput,
    type ModalProps,
} from '@mantine/core';
import { useForm, zodResolver } from '@mantine/form';
import { IconChartBar } from '@tabler/icons-react';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import MantineIcon from '../../../components/common/MantineIcon';
import {
    SaveDestination,
    SaveToSpace,
    validationSchema,
    type FormValues,
} from '../../../components/common/modal/ChartCreateModal/SaveToSpaceOrDashboard';
import {
    useCreateMutation as useSpaceCreateMutation,
    useSpaceSummaries,
} from '../../../hooks/useSpaces';
import {
    useSavedSqlChart,
    useUpdateSqlChartMutation,
} from '../hooks/useSavedSqlCharts';

type Props = Pick<ModalProps, 'opened' | 'onClose'> & {
    projectUuid: string;
    savedSqlUuid: string;
    onSuccess: () => void;
};

export const UpdateSqlChartModal = ({
    projectUuid,
    savedSqlUuid,
    opened,
    onClose,
    onSuccess,
}: Props) => {
    const { t } = useTranslation();

    const { data } = useSavedSqlChart({
        projectUuid,
        uuid: savedSqlUuid,
    });

    const { data: spaces = [] } = useSpaceSummaries(projectUuid, true);
    const { mutateAsync: createSpace } = useSpaceCreateMutation(projectUuid);

    const { mutateAsync: updateChart, isLoading: isSaving } =
        useUpdateSqlChartMutation(projectUuid, savedSqlUuid);
    const form = useForm<FormValues>({
        initialValues: {
            name: '',
            description: '',
            spaceUuid: '',
            newSpaceName: '',
            saveDestination: SaveDestination.Space,
        },
        validate: zodResolver(validationSchema),
    });

    useEffect(() => {
        if (data) {
            if (!form.values.name && data.name) {
                form.setFieldValue('name', data.name);
            }
            if (!form.values.description && data.description) {
                form.setFieldValue('description', data.description);
            }
            if (!form.values.spaceUuid && data.space.uuid) {
                form.setFieldValue('spaceUuid', data.space.uuid);
            }
        }
    }, [data, form]);

    const handleOnSubmit = form.onSubmit(
        async ({ name, description, spaceUuid, newSpaceName }) => {
            let newSpace = newSpaceName
                ? await createSpace({
                      name: newSpaceName,
                      access: [],
                      isPrivate: true,
                  })
                : undefined;

            await updateChart({
                unversionedData: {
                    name,
                    description: description ?? null,
                    spaceUuid: newSpace?.uuid || spaceUuid || spaces[0].uuid,
                },
            });

            onSuccess();
        },
    );

    return (
        <Modal
            opened={opened}
            onClose={onClose}
            keepMounted={false}
            title={
                <Group spacing="xs">
                    <MantineIcon icon={IconChartBar} size="lg" color="gray.7" />
                    <Text fw={500}>
                        {t('features_sql_runner_update_sql_chart_modal.title')}
                    </Text>
                </Group>
            }
            styles={(theme) => ({
                header: { borderBottom: `1px solid ${theme.colors.gray[4]}` },
                body: { padding: 0 },
            })}
        >
            <form onSubmit={handleOnSubmit}>
                <Stack p="md">
                    <Stack spacing="xs">
                        <TextInput
                            label={t(
                                'features_sql_runner_update_sql_chart_modal.name.label',
                            )}
                            placeholder={t(
                                'features_sql_runner_update_sql_chart_modal.name.placeholder',
                            )}
                            required
                            {...form.getInputProps('name')}
                        />
                        <Textarea
                            label={t(
                                'features_sql_runner_update_sql_chart_modal.name.description',
                            )}
                            {...form.getInputProps('description')}
                        />
                    </Stack>
                    <SaveToSpace
                        form={form}
                        spaces={spaces}
                        projectUuid={projectUuid}
                    />
                </Stack>

                <Group
                    position="right"
                    w="100%"
                    sx={(theme) => ({
                        borderTop: `1px solid ${theme.colors.gray[4]}`,
                        bottom: 0,
                        padding: theme.spacing.md,
                    })}
                >
                    <Button
                        onClick={onClose}
                        variant="outline"
                        disabled={isSaving}
                    >
                        {t('features_sql_runner_update_sql_chart_modal.cancel')}
                    </Button>
                    <Button
                        type="submit"
                        disabled={!form.values.name}
                        loading={isSaving}
                    >
                        {t('features_sql_runner_update_sql_chart_modal.save')}
                    </Button>
                </Group>
            </form>
        </Modal>
    );
};
