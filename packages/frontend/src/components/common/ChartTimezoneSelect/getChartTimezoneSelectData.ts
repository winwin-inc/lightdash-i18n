import {
    PROJECT_TIMEZONE_SETTING,
    TimeZone,
    USER_TIMEZONE_SETTING,
} from '@lightdash/common';
import { type TFunction } from 'i18next';

export type ChartTimezoneSelectGroup = {
    group: string;
    items: { value: string; label: string }[];
};

// Grouped options for the chart timezone dropdown. Labels here are the compact
// form shown in the closed control; the open list adds the UTC offset and the
// resolved project zone via the Select's renderOption.
export const getChartTimezoneSelectData = (
    localTimezone: string | undefined,
    t: TFunction,
): ChartTimezoneSelectGroup[] => {
    const localSuffix = t('components_chart_timezone_select.local_suffix');
    const specificZones = Object.keys(TimeZone)
        .filter((key) => isNaN(Number(key)))
        .map((key) => {
            const name = key.replaceAll('_', ' ');
            const label =
                key === localTimezone ? `${name}${localSuffix}` : name;
            return { value: key, label };
        });

    return [
        {
            group: t('components_chart_timezone_select.group_default'),
            items: [
                {
                    value: PROJECT_TIMEZONE_SETTING,
                    label: t(
                        'components_chart_timezone_select.project_timezone',
                    ),
                },
                {
                    value: USER_TIMEZONE_SETTING,
                    label: t('components_chart_timezone_select.user_timezone'),
                },
            ],
        },
        {
            group: t('components_chart_timezone_select.group_specific'),
            items: specificZones,
        },
    ];
};
