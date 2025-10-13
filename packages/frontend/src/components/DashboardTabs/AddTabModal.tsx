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
    onConfirm: (tabName: string) => void;
};

export const TabAddModal: FC<AddProps> = ({
    onClose,
    onConfirm,
    ...modalProps
}) => {
    const { t } = useTranslation();
    const form = useForm<{ tabName: string }>();

    const handleConfirm = form.onSubmit(({ ...tabProps }) => {
        onConfirm(tabProps.tabName);
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
                        {t('components_dashboard_tabs.add_tab_modal.title')}
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
                            'components_dashboard_tabs.add_tab_modal.form.tab_name.label',
                        )}
                        placeholder={t(
                            'components_dashboard_tabs.add_tab_modal.form.tab_name.placeholder',
                        )}
                        data-autofocus
                        required
                        {...form.getInputProps('tabName')}
                    ></TextInput>
                    <Group position="right" mt="sm">
                        <Button variant="outline" onClick={handleClose}>
                            {t(
                                'components_dashboard_tabs.add_tab_modal.cancel',
                            )}
                        </Button>

                        <Button type="submit" disabled={!form.isValid()}>
                            {t('components_dashboard_tabs.add_tab_modal.add')}
                        </Button>
                    </Group>
                </Stack>
            </form>
        </Modal>
    );
};
