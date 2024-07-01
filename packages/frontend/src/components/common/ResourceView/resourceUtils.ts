import {
    assertUnreachable,
    ChartKind,
    ResourceViewItemType,
    type ResourceViewItem,
} from '@lightdash/common';
import dayjs from 'dayjs';
import { useTranslation } from 'react-i18next';

export const useResourceTypeName = () => {
    const { t } = useTranslation();

    return (item: ResourceViewItem) => {
        switch (item.type) {
            case ResourceViewItemType.DASHBOARD:
                return t(
                    'components_common_resource_view_utils.resource_type_names.dashboard',
                );
            case ResourceViewItemType.SPACE:
                return t(
                    'components_common_resource_view_utils.resource_type_names.dashboard',
                );
            case ResourceViewItemType.CHART:
                switch (item.data.chartKind) {
                    case undefined:
                    case ChartKind.VERTICAL_BAR:
                        return t(
                            'components_common_resource_view_utils.resource_type_names.dashboard',
                        );
                    case ChartKind.HORIZONTAL_BAR:
                        return t(
                            'components_common_resource_view_utils.resource_type_names.dashboard',
                        );
                    case ChartKind.LINE:
                        return t(
                            'components_common_resource_view_utils.resource_type_names.dashboard',
                        );
                    case ChartKind.SCATTER:
                        return t(
                            'components_common_resource_view_utils.resource_type_names.dashboard',
                        );
                    case ChartKind.AREA:
                        return t(
                            'components_common_resource_view_utils.resource_type_names.dashboard',
                        );
                    case ChartKind.MIXED:
                        return t(
                            'components_common_resource_view_utils.resource_type_names.dashboard',
                        );
                    case ChartKind.PIE:
                        return t(
                            'components_common_resource_view_utils.resource_type_names.dashboard',
                        );
                    case ChartKind.FUNNEL:
                        return t(
                            'components_common_resource_view_utils.resource_type_names.dashboard',
                        );
                    case ChartKind.TABLE:
                        return t(
                            'components_common_resource_view_utils.resource_type_names.dashboard',
                        );
                    case ChartKind.BIG_NUMBER:
                        return t(
                            'components_common_resource_view_utils.resource_type_names.dashboard',
                        );
                    case ChartKind.CUSTOM:
                        return t(
                            'components_common_resource_view_utils.resource_type_names.dashboard',
                        );
                    default:
                        return assertUnreachable(
                            item.data.chartKind,
                            t(
                                'components_common_resource_view_utils.resource_type_names.dashboard',
                                {
                                    chartKind: item.data.chartKind,
                                },
                            ),
                        );
                }
            default:
                return assertUnreachable(item, 'Resource type not supported');
        }
    };
};

export const getResourceUrl = (projectUuid: string, item: ResourceViewItem) => {
    const itemType = item.type;
    switch (item.type) {
        case ResourceViewItemType.DASHBOARD:
            return `/projects/${projectUuid}/dashboards/${item.data.uuid}/view`;
        case ResourceViewItemType.CHART:
            return `/projects/${projectUuid}/saved/${item.data.uuid}`;
        case ResourceViewItemType.SPACE:
            return `/projects/${projectUuid}/spaces/${item.data.uuid}`;
        default:
            return assertUnreachable(item, `Can't get URL for ${itemType}`);
    }
};

export const getResourceName = (type: ResourceViewItemType) => {
    switch (type) {
        case ResourceViewItemType.DASHBOARD:
            return 'Dashboard';
        case ResourceViewItemType.CHART:
            return 'Chart';
        case ResourceViewItemType.SPACE:
            return 'Space';
        default:
            return assertUnreachable(type, 'Resource type not supported');
    }
};

export const getResourceViewsSinceWhenDescription = (
    item: ResourceViewItem,
) => {
    if (
        item.type !== ResourceViewItemType.CHART &&
        item.type !== ResourceViewItemType.DASHBOARD
    ) {
        throw new Error('Only supported for charts and dashboards');
    }

    return item.data.firstViewedAt
        ? `${item.data.views} views since ${dayjs(
              item.data.firstViewedAt,
          ).format('MMM D, YYYY h:mm A')}`
        : undefined;
};
