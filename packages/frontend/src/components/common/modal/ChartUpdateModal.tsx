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

import { useSavedQuery, useUpdateMutation } from '../../../hooks/useSavedQuery';
import useSearchParams from '../../../hooks/useSearchParams';

interface ChartUpdateModalProps extends ModalProps {
    uuid: string;
    onConfirm?: () => void;
}

type FormState = Pick<SavedChart, 'name' | 'description'>;

const ChartUpdateModal: FC<ChartUpdateModalProps> = ({
    uuid,
    onConfirm,
    ...modalProps
}) => {
    const dashboardUuid = useSearchParams('fromDashboard');
    const { data: chart, isInitialLoading } = useSavedQuery({ id: uuid });
    const { mutateAsync, isLoading: isUpdating } = useUpdateMutation(
        dashboardUuid ? dashboardUuid : undefined,
        uuid,
    );
    const { t } = useTranslation();

    const form = useForm<FormState>({
        initialValues: {
            name: '',
            description: '',
        },
    });

    const { setValues } = form;

    useEffect(() => {
        if (!chart) return;
        setValues({
            name: chart.name,
            description: chart.description,
        });
    }, [chart, setValues]);

    if (isInitialLoading || !chart) {
        return null;
    }

    const handleConfirm = form.onSubmit(async (data) => {
        await mutateAsync({
            name: data.name,
            description: data.description,
        });
        onConfirm?.();
    });

    return (
        <Modal
            title={
                <Title order={4}>
                    {t('components_common_modal_chart_update.title')}
                </Title>
            }
            {...modalProps}
        >
            <form
                title={t('components_common_modal_chart_update.title')}
                onSubmit={handleConfirm}
            >
                <Stack spacing="lg" pt="sm">
                    <TextInput
                        label={t(
                            'components_common_modal_chart_update.form.name.label',
                        )}
                        required
                        placeholder={t(
                            'components_common_modal_chart_update.form.name.placeholder',
                        )}
                        disabled={isUpdating}
                        {...form.getInputProps('name')}
                    />

                    <Textarea
                        label={t(
                            'components_common_modal_chart_update.form.description.label',
                        )}
                        placeholder={t(
                            'components_common_modal_chart_update.form.description.placeholder',
                        )}
                        disabled={isUpdating}
                        autosize
                        maxRows={3}
                        {...form.getInputProps('description')}
                    />

                    <Group position="right" mt="sm">
                        <Button variant="outline" onClick={modalProps.onClose}>
                            {t('components_common_modal_chart_update.cancel')}
                        </Button>

                        <Button
                            disabled={!form.isValid()}
                            loading={isUpdating}
                            type="submit"
                        >
                            {t('components_common_modal_chart_update.save')}
                        </Button>
                    </Group>
                </Stack>
            </form>
        </Modal>
    );
};

export default ChartUpdateModal;
