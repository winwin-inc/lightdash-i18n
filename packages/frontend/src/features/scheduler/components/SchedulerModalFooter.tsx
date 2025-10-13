import { Box, Button, Group, Tooltip } from '@mantine/core';
import { IconChevronLeft, IconSend } from '@tabler/icons-react';
import React from 'react';
import { useTranslation } from 'react-i18next';

import MantineIcon from '../../../components/common/MantineIcon';

interface FooterProps {
    confirmText?: string;
    disableConfirm?: boolean;
    onBack?: () => void;
    onSendNow?: () => void;
    canSendNow?: boolean;
    onCancel?: () => void;
    onConfirm?: () => void;
    loading?: boolean;
    disabledMessage?: string;
}

const SchedulersModalFooter = ({
    confirmText,
    disableConfirm,
    onBack,
    onCancel,
    onSendNow,
    canSendNow,
    onConfirm,
    loading,
    disabledMessage,
}: FooterProps) => {
    const { t } = useTranslation();

    return (
        <Group
            position="apart"
            sx={(theme) => ({
                position: 'sticky',
                backgroundColor: 'white',
                borderTop: `1px solid ${theme.colors.gray[4]}`,
                bottom: 0,
                zIndex: 2,
                padding: theme.spacing.md,
            })}
        >
            {!!onBack ? (
                <Button
                    onClick={onBack}
                    variant="subtle"
                    leftIcon={<MantineIcon icon={IconChevronLeft} />}
                >
                    {t('features_scheduler_modal_footer.back')}
                </Button>
            ) : (
                <Box />
            )}
            <Group>
                {!!onCancel && (
                    <Button onClick={onCancel} variant="outline">
                        {t('features_scheduler_modal_footer.cancel')}
                    </Button>
                )}
                {!!onSendNow && (
                    <Button
                        variant="light"
                        leftIcon={<MantineIcon icon={IconSend} />}
                        onClick={onSendNow}
                        disabled={loading || !canSendNow}
                    >
                        {t('features_scheduler_modal_footer.send_now')}
                    </Button>
                )}
                {!!confirmText && (
                    <Tooltip
                        label={disabledMessage}
                        disabled={!disableConfirm || !disabledMessage}
                        fz="xs"
                    >
                        <Box>
                            <Button
                                type="submit"
                                disabled={disableConfirm}
                                loading={loading}
                                onClick={onConfirm}
                            >
                                {confirmText}
                            </Button>
                        </Box>
                    </Tooltip>
                )}
            </Group>
        </Group>
    );
};

export default SchedulersModalFooter;
