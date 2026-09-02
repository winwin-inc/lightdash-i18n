import {
    ChartKind,
    ChartSourceType,
    ResourceViewItemType,
    assertUnreachable,
    type ResourceViewChartItem,
    type ResourceViewItem,
} from '@lightdash/common';
import dayjs from 'dayjs';
import { useCallback } from 'react';
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
            case ResourceViewItemType.DATA_APP:
                return t(
                    'components_common_resource_view_utils.resource_type_names.data_app',
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
                    case ChartKind.DATA_APP_VIZ:
                        return t(
                            'components_common_resource_view_utils.resource_type_names.custom_chart',
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
        case ResourceViewItemType.DATA_APP:
            return `/projects/${projectUuid}/apps/${item.data.uuid}/view`;
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
        case ResourceViewItemType.DATA_APP:
            return 'Data app';
        default:
            return assertUnreachable(type, 'Resource type not supported');
    }
};

export const useResourceGroupTitle = () => {
    const { t, i18n } = useTranslation();
    const isZh = i18n.language.toLowerCase().startsWith('zh');

    return useCallback(
        (types: ResourceViewItemType[]) => {
            const names = types.map((type) => {
                switch (type) {
                    case ResourceViewItemType.DASHBOARD:
                        return t(
                            'components_common_resource_view_content_type.dashboards',
                        );
                    case ResourceViewItemType.CHART:
                        return t(
                            'components_common_resource_view_content_type.charts',
                        );
                    case ResourceViewItemType.SPACE:
                        return t(
                            'components_common_resource_view_content_type.spaces',
                        );
                    case ResourceViewItemType.DATA_APP:
                        return t(
                            'components_common_resource_view_content_type.data_apps',
                        );
                    default:
                        return assertUnreachable(
                            type,
                            'Resource type not supported',
                        );
                }
            });

            if (names.length <= 1) {
                return names[0] ?? '';
            }

            if (isZh) {
                return names.join('、');
            }

            if (names.length === 2) {
                return `${names[0]} & ${names[1]}`;
            }

            return `${names.slice(0, -1).join(', ')} & ${
                names[names.length - 1]
            }`;
        },
        [t, isZh],
    );
};

export const formatLocalizedDateTime = (
    value: Date | string,
    isZh: boolean,
) =>
    dayjs(value).format(isZh ? 'YYYY年M月D日 H:mm' : 'MMM D, YYYY h:mm A');

type TranslateFn = (
    key: string,
    options?: Record<string, string | number>,
) => string;

export const formatViewsSinceDescription = ({
    count,
    firstViewedAt,
    t,
    isZh,
}: {
    count: number;
    firstViewedAt: Date | string;
    t: TranslateFn;
    isZh: boolean;
}) =>
    t('components_common_resource_view_list.views_since_description', {
        count,
        date: formatLocalizedDateTime(firstViewedAt, isZh),
    });

export const getResourceViewsSinceWhenDescription = (
    item: ResourceViewItem,
    t: TranslateFn,
    isZh: boolean,
) => {
    if (
        item.type !== ResourceViewItemType.CHART &&
        item.type !== ResourceViewItemType.DASHBOARD &&
        item.type !== ResourceViewItemType.DATA_APP
    ) {
        throw new Error('Only supported for charts, dashboards and data apps');
    }

    return item.data.firstViewedAt
        ? formatViewsSinceDescription({
              count: item.data.views,
              firstViewedAt: item.data.firstViewedAt,
              t,
              isZh,
          })
        : undefined;
};
