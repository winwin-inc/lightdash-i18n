import {
    isTimeZone,
    PROJECT_TIMEZONE_SETTING,
    USER_TIMEZONE_SETTING,
} from '@lightdash/common';
import { type TFunction } from 'i18next';

export const getTimezoneSourceLabel = (
    timezoneSetting: string | null | undefined,
    resolvedTimezone: string,
    t: TFunction,
): string => {
    if (timezoneSetting === USER_TIMEZONE_SETTING) {
        return t('components_explorer_visualization_timezone.source_user', {
            timezone: resolvedTimezone,
        });
    }
    if (
        timezoneSetting &&
        timezoneSetting !== PROJECT_TIMEZONE_SETTING &&
        isTimeZone(timezoneSetting)
    ) {
        return t('components_explorer_visualization_timezone.source_pinned', {
            timezone: resolvedTimezone,
        });
    }
    return t('components_explorer_visualization_timezone.source_project', {
        timezone: resolvedTimezone,
    });
};
