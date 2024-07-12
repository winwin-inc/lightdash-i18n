import { Button, Group, Modal, Stack, Text, TextInput } from '@mantine/core';
import { useForm, zodResolver } from '@mantine/form';
import { IconChartBar } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';

import MantineIcon from '../../../components/common/MantineIcon';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { toggleModal } from '../store/sqlRunnerSlice';

const validationSchema = z.object({
    name: z.string().min(1),
});

type FormValues = z.infer<typeof validationSchema>;

export const SaveSqlChartModal = () => {
    const { t } = useTranslation();

    const dispatch = useAppDispatch();
    const isOpen = useAppSelector(
        (state) => state.sqlRunner.modals.saveChartModal.isOpen,
    );

    const onClose = () => dispatch(toggleModal('saveChartModal'));

    const form = useForm<FormValues>({
        initialValues: {
            name: '',
        },
        validate: zodResolver(validationSchema),
    });

    const handleOnSubmit = () => {
        // TODO: save chart
    };

    return (
        <Modal
            opened={isOpen}
            onClose={onClose}
            keepMounted={false}
            title={
                <Group spacing="xs">
                    <MantineIcon icon={IconChartBar} size="lg" color="gray.7" />
                    <Text fw={500}>
                        {t('features_sql_chart_modal.save_chart')}
                    </Text>
                </Group>
            }
            styles={(theme) => ({
                header: { borderBottom: `1px solid ${theme.colors.gray[4]}` },
                body: { padding: 0 },
            })}
        >
            <form onSubmit={form.onSubmit(handleOnSubmit)}>
                <Stack p="md">
                    <Stack spacing="xs">
                        <TextInput
                            label={t(
                                'features_sql_chart_modal.memorable.label',
                            )}
                            placeholder={t(
                                'features_sql_chart_modal.memorable.placeholder',
                            )}
                            required
                            {...form.getInputProps('name')}
                        />
                    </Stack>
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
                    <Button onClick={onClose} variant="outline">
                        {t('features_sql_chart_modal.cancel')}
                    </Button>

                    <Button type="submit" disabled={!form.values.name}>
                        {t('features_sql_chart_modal.save')}
                    </Button>
                </Group>
            </form>
        </Modal>
    );
};
