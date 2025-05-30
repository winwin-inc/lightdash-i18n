import { type Dashboard } from '@lightdash/common';
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
    useDashboardQuery,
    useDuplicateDashboardMutation,
} from '../../../hooks/dashboard/useDashboard';

interface DashboardDuplicateModalProps extends ModalProps {
    uuid: string;
    onConfirm?: (dashboard: Dashboard) => void;
}

type FormState = Pick<Dashboard, 'name' | 'description'>;

const DashboardDuplicateModal: FC<DashboardDuplicateModalProps> = ({
    uuid,
    onConfirm,
    ...modalProps
}) => {
    const { t } = useTranslation();

    const { mutateAsync: duplicateDashboard, isLoading: isUpdating } =
        useDuplicateDashboardMutation({
            showRedirectButton: true,
        });
    const { data: dashboard, isInitialLoading } = useDashboardQuery(uuid);

    const form = useForm<FormState>();

    useEffect(() => {
        if (!dashboard) return;

        const initialValues = {
            name: `${t(
                'components_common_modal_dashboard_duplicate.copy_of',
            )} ${dashboard.name}`,
            description: dashboard.description ?? '',
        };

        if (!form.initialized) {
            form.initialize(initialValues);
        } else {
            form.setInitialValues(initialValues);
            form.setValues(initialValues);
        }

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dashboard]);

    const handleConfirm = form.onSubmit(async (data) => {
        const updatedDashboard = await duplicateDashboard({
            uuid: uuid,
            name: data.name,
            description: data.description,
        });

        onConfirm?.(updatedDashboard);
    });

    const isLoading =
        isInitialLoading || !dashboard || !form.initialized || isUpdating;

    return (
        <Modal
            title={
                <Title order={4}>
                    {t(
                        'components_common_modal_dashboard_duplicate.duplicate_dashboard',
                    )}
                </Title>
            }
            {...modalProps}
        >
            <form
                title={t(
                    'components_common_modal_dashboard_duplicate.form.title',
                )}
                onSubmit={handleConfirm}
            >
                <Stack spacing="lg" pt="sm">
                    <TextInput
                        label={t(
                            'components_common_modal_dashboard_duplicate.form.dashboards.label',
                        )}
                        required
                        placeholder={t(
                            'components_common_modal_dashboard_duplicate.form.dashboards.placeholder',
                        )}
                        disabled={isLoading}
                        {...form.getInputProps('name')}
                        value={form.values.name ?? ''}
                    />

                    <Textarea
                        label={t(
                            'components_common_modal_dashboard_duplicate.form.description.label',
                        )}
                        placeholder={t(
                            'components_common_modal_dashboard_duplicate.form.description.placeholder',
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
                                'components_common_modal_dashboard_duplicate.form.cancel',
                            )}
                        </Button>

                        <Button
                            disabled={!form.isValid()}
                            loading={isLoading}
                            type="submit"
                        >
                            {t(
                                'components_common_modal_dashboard_duplicate.form.create_duplicate',
                            )}
                        </Button>
                    </Group>
                </Stack>
            </form>
        </Modal>
    );
};

export default DashboardDuplicateModal;
