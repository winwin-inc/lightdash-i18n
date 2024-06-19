import { type InviteLink } from '@lightdash/common';
import {
    ActionIcon,
    Alert,
    CopyButton,
    Stack,
    Text,
    TextInput,
    Tooltip,
} from '@mantine/core';
import { IconCheck, IconCopy } from '@tabler/icons-react';
import React, { useMemo, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { useToggle } from 'react-use';

import { useApp } from '../../../providers/AppProvider';
import MantineIcon from '../../common/MantineIcon';

const InviteSuccess: FC<{
    invite: InviteLink;
    hasMarginTop?: boolean;
    onClose?: () => void;
}> = ({ invite, hasMarginTop, onClose }) => {
    const { health } = useApp();
    const [show, toggle] = useToggle(true);
    const { t } = useTranslation();

    const message = useMemo(() => {
        const days = Math.ceil(
            (invite.expiresAt.getTime() - new Date().getTime()) /
                (1000 * 60 * 60 * 24),
        );
        if (health.data?.hasEmailClient) {
            return (
                <>
                    {t(
                        'components_user_settings_groups_panel_invites_success.has_email_content.part_1',
                    )}{' '}
                    <b>{invite.email}</b>{' '}
                    {t(
                        'components_user_settings_groups_panel_invites_success.has_email_content.part_2',
                        { days },
                    )}
                </>
            );
        }
        return (
            <>
                {t(
                    'components_user_settings_groups_panel_invites_success.no_email_content.part_1',
                )}{' '}
                <b>{invite.email}</b>{' '}
                {t(
                    'components_user_settings_groups_panel_invites_success.no_email_content.part_2',
                    { days },
                )}
            </>
        );
    }, [health.data?.hasEmailClient, invite.email, invite.expiresAt, t]);

    if (!show) {
        return null;
    }

    return (
        <Alert
            icon={<IconCheck />}
            mt={hasMarginTop ? 'md' : 0}
            color="green"
            withCloseButton={true}
            closeButtonLabel={t(
                'components_user_settings_groups_panel_invites_success.alert.close',
            )}
            onClose={() => {
                toggle(false);
                onClose?.();
            }}
        >
            <Stack spacing="md">
                <Text>{message}</Text>
                <TextInput
                    id="invite-link-input"
                    readOnly
                    className="sentry-block ph-no-capture"
                    value={invite.inviteUrl}
                    rightSection={
                        <CopyButton value={invite.inviteUrl}>
                            {({ copied, copy }) => (
                                <Tooltip
                                    label={copied ? 'Copied' : 'Copy'}
                                    withArrow
                                    position="right"
                                >
                                    <ActionIcon
                                        color={copied ? 'teal' : 'gray'}
                                        onClick={copy}
                                    >
                                        <MantineIcon
                                            icon={copied ? IconCheck : IconCopy}
                                        />
                                    </ActionIcon>
                                </Tooltip>
                            )}
                        </CopyButton>
                    }
                />
            </Stack>
        </Alert>
    );
};

export default InviteSuccess;
