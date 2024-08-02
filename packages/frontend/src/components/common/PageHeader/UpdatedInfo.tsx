import { type SessionUser } from '@lightdash/common';
import { Text } from '@mantine/core';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';

import { useTimeAgo } from '../../../hooks/useTimeAgo';

const TimeAgo: FC<{
    updatedAt: Date;
    partiallyBold?: boolean;
}> = ({ updatedAt, partiallyBold = true }) => {
    const timeAgo = useTimeAgo(updatedAt || new Date());

    return (
        <Text span fw={partiallyBold ? 600 : 'default'}>
            {timeAgo}
        </Text>
    );
};

export const UpdatedInfo: FC<{
    updatedAt: Date | undefined;
    user: Partial<SessionUser> | null | undefined;
    partiallyBold?: boolean;
}> = ({ updatedAt, user, partiallyBold = true }) => {
    const { t } = useTranslation();

    return (
        <Text c="gray.6" fz="xs">
            {t('components_common_page_header.last_edited')}{' '}
            {updatedAt && (
                <>
                    <TimeAgo
                        updatedAt={updatedAt}
                        partiallyBold={partiallyBold}
                    />{' '}
                </>
            )}
            {user && user.firstName ? (
                <>
                    {t('components_common_page_header.by')}{' '}
                    <Text span fw={partiallyBold ? 600 : 'default'}>
                        {user.firstName} {user.lastName}
                    </Text>
                </>
            ) : (
                ''
            )}
        </Text>
    );
};
