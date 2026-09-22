import { subject } from '@casl/ability';
import { type SessionUser } from '@lightdash/common';

export const canAdminUploadDataApp = (
    user: Pick<SessionUser, 'ability' | 'organizationUuid'> | undefined,
    projectUuid: string,
): boolean => {
    if (!user?.ability || !user.organizationUuid) {
        return false;
    }
    return (
        user.ability.can(
            'manage',
            subject('DataApp', {
                organizationUuid: user.organizationUuid,
            }),
        ) ||
        user.ability.can(
            'manage',
            subject('DataApp', {
                projectUuid,
            }),
        )
    );
};
