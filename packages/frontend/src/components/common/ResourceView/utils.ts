import type { ResourceViewSpaceItem } from '@lightdash/common';
import { assertUnreachable } from '@lightdash/common';
import { useTranslation } from 'react-i18next';
import { ResourceAccess } from './types';

export const getResourceAccessType = (
    item: ResourceViewSpaceItem,
): ResourceAccess => {
    if (!item.data.isPrivate) {
        return ResourceAccess.Public;
    } else if (item.data.accessListLength > 1) {
        return ResourceAccess.Shared;
    } else {
        return ResourceAccess.Private;
    }
};

export const useResourceAccessLabel = () => {
    const { t } = useTranslation();

    return (item: ResourceViewSpaceItem) => {
        const accessType = getResourceAccessType(item);

        switch (accessType) {
            case ResourceAccess.Private:
                return t(
                    'components_common_resource_view_access_info.only_visible_to_you',
                );
            case ResourceAccess.Public:
                return t(
                    'components_common_resource_view_access_info.project_access',
                );
            case ResourceAccess.Shared:
                return t(
                    'components_common_resource_view_access_info.shared_with',
                    {
                        length: item.data.accessListLength,
                        suffix: item.data.accessListLength > 1 ? 's' : '',
                    },
                );
            default:
                return assertUnreachable(
                    accessType,
                    `Unknown access type ${accessType}`,
                );
        }
    };
};
