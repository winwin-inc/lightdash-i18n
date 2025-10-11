import { Button, Flex, Text } from '@mantine/core';
import { IconSend } from '@tabler/icons-react';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';

import MantineModal from '../../../components/common/MantineModal';

type ConfirmSendNowModalProps = {
    opened: boolean;
    schedulerName: string;
    loading?: boolean;
    onClose: () => void;
    onConfirm: () => void;
};

const ConfirmSendNowModal: FC<ConfirmSendNowModalProps> = ({
    opened,
    schedulerName,
    loading,
    onClose,
    onConfirm,
}) => {
    const { t } = useTranslation();

    return (
        <MantineModal
            opened={opened}
            onClose={onClose}
            title={t('features_scheduler_confirm_send_now_modal.title', {
                schedulerName,
            })}
            icon={IconSend}
            size="xl"
            actions={
                <Flex gap="sm">
                    <Button variant="default" onClick={onClose}>
                        {t('features_scheduler_confirm_send_now_modal.cancel')}
                    </Button>
                    <Button onClick={onConfirm} loading={loading}>
                        {t(
                            'features_scheduler_confirm_send_now_modal.send_now',
                        )}
                    </Button>
                </Flex>
            }
        >
            <Text>
                {t('features_scheduler_confirm_send_now_modal.content')}
            </Text>
        </MantineModal>
    );
};

export default ConfirmSendNowModal;
