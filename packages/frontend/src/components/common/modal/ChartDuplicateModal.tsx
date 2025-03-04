import { type SavedChart } from '@lightdash/common';
import {
    Button,
    Group,
    Modal,
    Stack,
    TextInput,
    Textarea,
    Title,
    type ModalProps,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { useEffect, type FC } from 'react';
import { useTranslation } from 'react-i18next';

import {
    useDuplicateChartMutation,
    useSavedQuery,
} from '../../../hooks/useSavedQuery';

interface ChartDuplicateModalProps extends ModalProps {
    uuid: string;
    onConfirm?: (savedChart: SavedChart) => void;
}

type FormState = Pick<SavedChart, 'name' | 'description'>;

const ChartDuplicateModal: FC<ChartDuplicateModalProps> = ({
    uuid,
    onConfirm,
    ...modalProps
}) => {
    const { mutateAsync: duplicateChart, isLoading: isUpdating } =
        useDuplicateChartMutation({
            showRedirectButton: true,
        });
    const { data: savedQuery, isInitialLoading } = useSavedQuery({ id: uuid });
    const { t } = useTranslation();

    const form = useForm<FormState>();

    useEffect(() => {
        if (!savedQuery) return;

        const initialValues = {
            name: `Copy of ${savedQuery.name}`,
            description: savedQuery.description,
        };

        if (!form.initialized) {
            form.initialize(initialValues);
        } else {
            form.setInitialValues(initialValues);
            form.setValues(initialValues);
        }

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [savedQuery]);

    const isLoading =
        isInitialLoading || !savedQuery || !form.initialized || isUpdating;

    const handleConfirm = form.onSubmit(async (data) => {
        const updatedChart = await duplicateChart({
            uuid: uuid,
            name: data.name,
            description: data.description,
        });

        onConfirm?.(updatedChart);
    });

    return (
        <Modal
            title={
                <Title order={4}>
                    {t('components_common_modal_chart_duplicate.title')}
                </Title>
            }
            {...modalProps}
        >
            <form
                title={t('components_common_modal_chart_duplicate.title')}
                onSubmit={handleConfirm}
            >
                <Stack spacing="lg" pt="sm">
                    <TextInput
                        label={t(
                            'components_common_modal_chart_duplicate.form.name.label',
                        )}
                        required
                        placeholder={t(
                            'components_common_modal_chart_duplicate.form.name.placeholder',
                        )}
                        disabled={isLoading}
                        {...form.getInputProps('name')}
                        value={form.values.name ?? ''}
                    />

                    <Textarea
                        label={t(
                            'components_common_modal_chart_duplicate.form.description.label',
                        )}
                        placeholder={t(
                            'components_common_modal_chart_duplicate.form.description.placeholder',
                        )}
                        disabled={isLoading}
                        autosize
                        maxRows={3}
                        {...form.getInputProps('description')}
                        value={form.values.description ?? ''}
                    />

                    <Group position="right" mt="sm">
                        <Button variant="outline" onClick={modalProps.onClose}>
                            {t(
                                'components_common_modal_chart_duplicate.cancel',
                            )}
                        </Button>

                        <Button
                            disabled={!form.isValid()}
                            loading={isLoading}
                            type="submit"
                        >
                            {t(
                                'components_common_modal_chart_duplicate.create',
                            )}
                        </Button>
                    </Group>
                </Stack>
            </form>
        </Modal>
    );
};

export default ChartDuplicateModal;
