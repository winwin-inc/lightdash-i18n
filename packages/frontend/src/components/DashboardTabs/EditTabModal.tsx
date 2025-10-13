import { type DashboardTab } from '@lightdash/common';
import {
    Button,
    Group,
    Modal,
    Stack,
    TextInput,
    Title,
    type ModalProps,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';

type AddProps = ModalProps & {
    tab: DashboardTab;
    onConfirm: (tabName: string, tabUuid: string) => void;
};

export const TabEditModal: FC<AddProps> = ({
    tab,
    onClose,
    onConfirm,
    ...modalProps
}) => {
    const { t } = useTranslation();

    const form = useForm<{ newTabName: string }>({
        initialValues: {
            newTabName: tab.name,
        },
    });

    const handleConfirm = form.onSubmit(({ ...tabProps }) => {
        onConfirm(tabProps.newTabName, tab.uuid);
        form.reset();
    });

    const handleClose = () => {
        form.reset();
        onClose?.();
    };

    return (
        <Modal
            title={
                <Group spacing="xs">
                    <Title order={4}>
                        {t('components_dashboard_tabs.edit_tab_modal.title')}
                    </Title>
                </Group>
            }
            {...modalProps}
            size="sm"
            onClose={handleClose}
        >
            <form onSubmit={handleConfirm}>
                <Stack spacing="lg" pt="sm">
                    <TextInput
                        label={t(
                            'components_dashboard_tabs.edit_tab_modal.form.tab_name.label',
                        )}
                        placeholder={t(
                            'components_dashboard_tabs.edit_tab_modal.form.tab_name.placeholder',
                        )}
                        data-autofocus
                        required
                        {...form.getInputProps('newTabName')}
                    ></TextInput>
                    <Group position="right" mt="sm">
                        <Button variant="outline" onClick={handleClose}>
                            {t(
                                'components_dashboard_tabs.edit_tab_modal.cancel',
                            )}
                        </Button>

                        <Button type="submit" disabled={!form.isValid()}>
                            {t(
                                'components_dashboard_tabs.edit_tab_modal.update',
                            )}
                        </Button>
                    </Group>
                </Stack>
            </form>
        </Modal>
    );
};
