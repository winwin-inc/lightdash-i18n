import { subject } from '@casl/ability';
import { type UserWithAbility } from '../../../hooks/user/useUser';

export const canAdminUploadDataApp = (
    user: Pick<UserWithAbility, 'ability' | 'organizationUuid'> | undefined,
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
