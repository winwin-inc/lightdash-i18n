import { type Dashboard } from '@lightdash/common';
import {
    Button,
    Group,
    Modal,
    Stack,
    Textarea,
    TextInput,
    Title,
    type ModalProps,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { useEffect, type FC } from 'react';
import { useTranslation } from 'react-i18next';

import {
    useDashboardQuery,
    useUpdateDashboard,
} from '../../../hooks/dashboard/useDashboard';

interface DashboardUpdateModalProps extends ModalProps {
    uuid: string;
    onConfirm?: () => void;
}

type FormState = Pick<Dashboard, 'name' | 'description'>;

const DashboardUpdateModal: FC<DashboardUpdateModalProps> = ({
    uuid,
    onConfirm,
    ...modalProps
}) => {
    const { t } = useTranslation();
    const { data: dashboard, isInitialLoading } = useDashboardQuery(uuid);
    const { mutateAsync, isLoading: isUpdating } = useUpdateDashboard(uuid);

    const form = useForm<FormState>({
        initialValues: {
            name: '',
            description: '',
        },
    });

    const { setValues } = form;

    useEffect(() => {
        if (!dashboard) return;

        setValues({
            name: dashboard.name,
            description: dashboard.description ?? '',
        });
    }, [dashboard, setValues]);

    if (isInitialLoading || !dashboard) {
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
                    {t(
                        'components_common_modal_dashboard_update.update_dashboard',
                    )}
                </Title>
            }
            {...modalProps}
        >
            <form
                title={t('components_common_modal_dashboard_update.form.title')}
                onSubmit={handleConfirm}
            >
                <Stack spacing="lg" pt="sm">
                    <TextInput
                        label={t(
                            'components_common_modal_dashboard_update.form.dashboards.label',
                        )}
                        required
                        placeholder={t(
                            'components_common_modal_dashboard_update.form.dashboards.placeholder',
                        )}
                        disabled={isUpdating}
                        {...form.getInputProps('name')}
                    />

                    <Textarea
                        label={t(
                            'components_common_modal_dashboard_update.form.description.label',
                        )}
                        placeholder={t(
                            'components_common_modal_dashboard_update.form.description.placeholder',
                        )}
                        disabled={isUpdating}
                        autosize
                        maxRows={3}
                        {...form.getInputProps('description')}
                    />

                    <Group position="right" mt="sm">
                        <Button variant="outline" onClick={modalProps.onClose}>
                            {t(
                                'components_common_modal_dashboard_update.form.cancel',
                            )}
                        </Button>

                        <Button
                            disabled={!form.isValid()}
                            loading={isUpdating}
                            type="submit"
                        >
                            {t(
                                'components_common_modal_dashboard_update.form.save',
                            )}
                        </Button>
                    </Group>
                </Stack>
            </form>
        </Modal>
    );
};

export default DashboardUpdateModal;
