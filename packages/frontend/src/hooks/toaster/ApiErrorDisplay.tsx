import type { ApiErrorDetail } from '@lightdash/common';
import {
    ActionIcon,
    CopyButton,
    Group,
    Modal,
    Stack,
    Text,
    Tooltip,
} from '@mantine/core';
import { IconCheck, IconCopy } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';

import MantineIcon from '../../components/common/MantineIcon';
import { SnowflakeFormInput } from '../../components/UserSettings/MyWarehouseConnectionsPanel/WarehouseFormInputs';

const ApiErrorDisplay = ({
    apiError,
    onClose,
}: {
    apiError: ApiErrorDetail;
    onClose?: () => void;
}) => {
    const { t } = useTranslation();

    switch (apiError.name) {
        case 'SnowflakeTokenError':
            return (
                <>
                    <Modal
                        opened={true}
                        onClose={() => onClose?.()}
                        title={t('hooks_toaster.snowflake.title')}
                        centered
                        size="md"
                    >
                        <Stack spacing="md">
                            <Text mb={0} color="red">
                                {apiError.message}
                            </Text>

                            <Text mb={0}>
                                {t('hooks_toaster.snowflake.message')}
                            </Text>

                            <SnowflakeFormInput
                                onClose={() => {
                                    onClose?.();
                                }}
                            />
                        </Stack>
                    </Modal>
                    <Text mb={0}>{apiError.message}</Text>
                </>
            );
        default:
            break;
    }
    return apiError.sentryEventId || apiError.sentryTraceId ? (
        <Stack spacing="xxs">
            <Text mb={0}>{apiError.message}</Text>
            <Text mb={0} weight="bold">
                {t('hooks_toaster.contact_support.title')}
            </Text>
            <Group spacing="xxs" align="flex-start">
                <Text mb={0} weight="bold">
                    {t('hooks_toaster.contact_support.error_id')}: {apiError.sentryEventId || 'n/a'}
                    <br />
                    {t('hooks_toaster.contact_support.trace_id')}: {apiError.sentryTraceId || 'n/a'}
                </Text>
                <CopyButton
                    value={`${t('hooks_toaster.contact_support.error_id')}: ${
                        apiError.sentryEventId || 'n/a'
                    } ${t('hooks_toaster.contact_support.trace_id')}: ${apiError.sentryTraceId || 'n/a'}`}
                >
                    {({ copied, copy }) => (
                        <Tooltip
                            label={copied ? t('hooks_toaster.contact_support.copied') : t('hooks_toaster.contact_support.copy_error_id')}
                            withArrow
                            position="right"
                        >
                            <ActionIcon
                                size="xs"
                                onClick={copy}
                                variant={'transparent'}
                            >
                                <MantineIcon
                                    color={'white'}
                                    icon={copied ? IconCheck : IconCopy}
                                />
                            </ActionIcon>
                        </Tooltip>
                    )}
                </CopyButton>
            </Group>
        </Stack>
    ) : (
        <>{apiError.message}</>
    );
};

export default ApiErrorDisplay;
