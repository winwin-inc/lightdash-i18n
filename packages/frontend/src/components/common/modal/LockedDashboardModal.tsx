import { Modal, Stack, Text, type ModalProps } from '@mantine/core';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';

export const LockedDashboardModal: FC<Pick<ModalProps, 'opened'>> = ({
    opened,
}) => {
    const { t } = useTranslation();

    return (
        <Modal
            opened={opened}
            lockScroll={false}
            withCloseButton={false}
            centered
            withinPortal
            withOverlay={false}
            onClose={() => {}}
            styles={(theme) => ({
                content: {
                    border: `1px solid ${theme.colors.gray[2]}`,
                    boxShadow: 'none',
                },
            })}
        >
            <Text fw={600} fz="lg" ta="center" mb="lg">
                {t('components_modal_dashboard_locked.part_1')}
            </Text>
            <Stack spacing="xs">
                <Text>{t('components_modal_dashboard_locked.part_2')}</Text>
            </Stack>
        </Modal>
    );
};
