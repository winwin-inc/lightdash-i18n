import {
    ChartKind,
    ChartSourceType,
    ResourceViewItemType,
    assertUnreachable,
    type ResourceViewChartItem,
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
                    'components_common_resource_view_utils.resource_type_names.space',
                );
            case ResourceViewItemType.CHART:
                switch (item.data.chartKind) {
                    case undefined:
                    case ChartKind.VERTICAL_BAR:
                        return t(
                            'components_common_resource_view_utils.resource_type_names.bar_chart',
                        );
                    case ChartKind.HORIZONTAL_BAR:
                        return t(
                            'components_common_resource_view_utils.resource_type_names.horizontal_bar_chart',
                        );
                    case ChartKind.LINE:
                        return t(
                            'components_common_resource_view_utils.resource_type_names.line_chart',
                        );
                    case ChartKind.SCATTER:
                        return t(
                            'components_common_resource_view_utils.resource_type_names.scatter_chart',
                        );
                    case ChartKind.AREA:
                        return t(
                            'components_common_resource_view_utils.resource_type_names.area_chart',
                        );
                    case ChartKind.MIXED:
                        return t(
                            'components_common_resource_view_utils.resource_type_names.mixed_chart',
                        );
                    case ChartKind.PIE:
                        return t(
                            'components_common_resource_view_utils.resource_type_names.pie_chart',
                        );
                    case ChartKind.FUNNEL:
                        return t(
                            'components_common_resource_view_utils.resource_type_names.funnel_chart',
                        );
                    case ChartKind.TREEMAP:
                        return t(
                            'components_common_resource_view_utils.resource_type_names.treemap',
                        );
                    case ChartKind.TABLE:
                        return t(
                            'components_common_resource_view_utils.resource_type_names.table',
                        );
                    case ChartKind.BIG_NUMBER:
                        return t(
                            'components_common_resource_view_utils.resource_type_names.big_number',
                        );
                    case ChartKind.CUSTOM:
                        return t(
                            'components_common_resource_view_utils.resource_type_names.custom_visualization',
                        );
                    default:
                        return assertUnreachable(
                            item.data.chartKind,
                            t(
                                'components_common_resource_view_utils.resource_type_names.not_supported',
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

const getChartResourceUrl = (
    projectUuid: string,
    item: ResourceViewChartItem,
) => {
    switch (item.data.source) {
        case ChartSourceType.SQL:
            return `/projects/${projectUuid}/sql-runner/${item.data.slug}`;
        case ChartSourceType.DBT_EXPLORE:
        case undefined:
            return `/projects/${projectUuid}/saved/${item.data.uuid}`;
        default:
            return assertUnreachable(
                item.data.source,
                `Unknown source type: ${item.data.source}`,
            );
    }
};

export const getResourceUrl = (projectUuid: string, item: ResourceViewItem) => {
    const itemType = item.type;
    switch (item.type) {
        case ResourceViewItemType.DASHBOARD:
            return `/projects/${projectUuid}/dashboards/${item.data.uuid}/view`;
        case ResourceViewItemType.CHART:
            return getChartResourceUrl(projectUuid, item);
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
