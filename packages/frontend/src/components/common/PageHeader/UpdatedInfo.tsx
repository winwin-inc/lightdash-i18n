import { type SessionUser } from '@lightdash/common';
import { Text } from '@mantine/core';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';

import { useTimeAgo } from '../../../hooks/useTimeAgo';

export const UpdatedInfo: FC<{
    updatedAt: Date;
    user: Partial<SessionUser> | undefined;
    partiallyBold?: boolean;
}> = ({ updatedAt, user, partiallyBold = true }) => {
    const timeAgo = useTimeAgo(updatedAt);
    const { t } = useTranslation();

    return (
        <Text c="gray.6" fz="xs">
            {t('components_common_page_header.last_edited')}{' '}
            <Text span fw={partiallyBold ? 600 : 'default'}>
                {timeAgo}
            </Text>{' '}
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
