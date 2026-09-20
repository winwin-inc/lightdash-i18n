import { Avatar, useMantineTheme, type AvatarProps } from '@mantine/core';
import { forwardRef } from 'react';

import useApp from '../providers/App/useApp';

const getUserAvatarInitials = (
    firstName: string | undefined,
    lastName: string | undefined,
    email: string | undefined,
): string => {
    const first = firstName?.trim() ?? '';
    const last = lastName?.trim() ?? '';

    if (first && last) {
        return `${first[0]}${last[0]}`.toLocaleUpperCase();
    }

    const single = first || last || email?.trim() || '';
    return single[0]?.toLocaleUpperCase() ?? '';
};

export const UserAvatar = forwardRef<HTMLDivElement, AvatarProps>(
    (props, ref) => {
        const { user } = useApp();
        const theme = useMantineTheme();
        const initials = user.data
            ? getUserAvatarInitials(
                  user.data.firstName,
                  user.data.lastName,
                  user.data.email,
              )
            : '';

        return (
            <Avatar
                data-testid="user-avatar"
                ref={ref}
                variant="light"
                size={theme.spacing.xxl}
                radius="xl"
                color="gray.8"
                bg="gray.3"
                sx={{ cursor: 'pointer' }}
                {...props}
            >
                {initials}
            </Avatar>
        );
    },
);
