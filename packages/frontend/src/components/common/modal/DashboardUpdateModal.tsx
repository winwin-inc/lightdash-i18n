import { type Dashboard } from '@lightdash/common';
import {
    Button,
    Group,
    Stack,
    TextInput,
    Textarea,
    type ModalProps,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconLayoutDashboard } from '@tabler/icons-react';
import { useEffect, type FC } from 'react';
import { useTranslation } from 'react-i18next';

import {
    useDashboardQuery,
    useUpdateDashboard,
} from '../../../hooks/dashboard/useDashboard';
import MantineModal from '../MantineModal';

interface DashboardUpdateModalProps {
    opened: ModalProps['opened'];
    onClose: ModalProps['onClose'];
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
        <MantineModal
            title={t(
                'components_common_modal_dashboard_update.update_dashboard',
            )}
            {...modalProps}
            icon={IconLayoutDashboard}
            actions={
                <Group position="right">
                    <Button variant="outline" onClick={modalProps.onClose}>
                        {t(
                            'components_common_modal_dashboard_update.form.cancel',
                        )}
                    </Button>

                    <Button
                        disabled={!form.isValid()}
                        loading={isUpdating}
                        type="submit"
                        form="update-dashboard"
                    >
                        {t(
                            'components_common_modal_dashboard_update.form.save',
                        )}
                    </Button>
                </Group>
            }
        >
            <form
                id="update-dashboard"
                title={t(
                    'components_common_modal_dashboard_update.update_dashboard',
                )}
                onSubmit={handleConfirm}
            >
                <Stack spacing="lg">
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
                </Stack>
            </form>
        </MantineModal>
    );
};

export default DashboardUpdateModal;
