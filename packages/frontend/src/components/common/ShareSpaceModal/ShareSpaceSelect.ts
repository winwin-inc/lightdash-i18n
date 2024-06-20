import { useTranslation } from 'react-i18next';

export interface AccessOption {
    title: string;
    description?: string;
    selectDescription: string;
    value: string;
}

export const enum SpacePrivateAccessType {
    PRIVATE = 'private',
    SHARED = 'shared',
}

export const enum SpaceAccessType {
    PRIVATE = 'private',
    PUBLIC = 'public',
}

export const useSpaceAccessOptions = () => {
    const { t } = useTranslation();

    return [
        {
            title: t(
                'components_common_share_space_modal.space_access_options.restricted_access.title',
            ),
            description: t(
                'components_common_share_space_modal.space_access_options.restricted_access.description',
            ),
            selectDescription: t(
                'components_common_share_space_modal.space_access_options.restricted_access.select_description',
            ),
            value: SpaceAccessType.PRIVATE,
        },
        {
            title: t(
                'components_common_share_space_modal.space_access_options.public_access.title',
            ),
            description: t(
                'components_common_share_space_modal.space_access_options.public_access.description',
            ),
            selectDescription: t(
                'components_common_share_space_modal.space_access_options.public_access.select_description',
            ),
            value: SpaceAccessType.PUBLIC,
        },
    ] as AccessOption[];
};

export const enum UserAccessAction {
    DELETE = 'delete',
    VIEWER = 'viewer',
    EDITOR = 'editor',
    ADMIN = 'admin',
}

export const useUserAccessOptions = () => {
    const { t } = useTranslation();

    return [
        {
            title: t(
                'components_common_share_space_modal.user_access_options.can_view.title',
            ),
            selectDescription: t(
                'components_common_share_space_modal.user_access_options.can_view.select_description',
            ),
            value: UserAccessAction.VIEWER,
        },
        {
            title: t(
                'components_common_share_space_modal.user_access_options.can_edit.title',
            ),
            selectDescription: t(
                'components_common_share_space_modal.user_access_options.can_edit.select_description',
            ),
            value: UserAccessAction.EDITOR,
        },
        {
            title: t(
                'components_common_share_space_modal.user_access_options.full_access.title',
            ),
            selectDescription: t(
                'components_common_share_space_modal.user_access_options.full_access.select_description',
            ),
            value: UserAccessAction.ADMIN,
        },
        {
            title: t(
                'components_common_share_space_modal.user_access_options.no_access.title',
            ),
            selectDescription: t(
                'components_common_share_space_modal.user_access_options.no_access.select_description',
            ),
            value: UserAccessAction.DELETE,
        },
    ] as AccessOption[];
};
