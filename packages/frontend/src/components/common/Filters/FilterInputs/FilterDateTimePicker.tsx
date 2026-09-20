import {
    FeatureFlags,
    getTimezoneLabel,
    isValidTimezone,
} from '@lightdash/common';
import { Group, Text } from '@mantine/core';
import {
    DateTimePicker,
    type DateTimePickerProps,
    type DayOfWeek,
} from '@mantine/dates';
import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import { useCallback, useMemo, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { useProject } from '../../../../hooks/useProject';
import { useServerFeatureFlag } from '../../../../hooks/useServerOrClientFeatureFlag';
import useFiltersContext from '../useFiltersContext';
import {
    shiftToProjectTimezone,
    unshiftFromProjectTimezone,
} from './FilterDateTimePicker.utils';

dayjs.extend(utc);
dayjs.extend(timezone);

const SUBTEXT_DATE_FORMAT = 'ddd, DD MMM YYYY HH:mm:ss';

interface Props
    extends Omit<
        DateTimePickerProps,
        'firstDayOfWeek' | 'getDayProps' | 'value' | 'onChange'
    > {
    value: Date | null;
    onChange: (value: Date) => void;
    firstDayOfWeek: DayOfWeek;
    showTimezone?: boolean;
}

const FilterDateTimePicker: FC<Props> = ({
    value,
    onChange,
    firstDayOfWeek,
    showTimezone = true,
    ...rest
}) => {
    const { t } = useTranslation();
    const displayFormat = 'YYYY-MM-DD HH:mm:ss';

    const { projectUuid, metricQueryTimezone } = useFiltersContext();
    const { data: enableTimezoneSupportFlag } = useServerFeatureFlag(
        FeatureFlags.EnableTimezoneSupport,
    );
    const { data: project } = useProject(projectUuid);

    const candidateTimezone =
        metricQueryTimezone ?? project?.queryTimezone ?? undefined;
    const projectTimezone =
        enableTimezoneSupportFlag?.enabled &&
        project?.useProjectTimezoneInFilters &&
        candidateTimezone &&
        isValidTimezone(candidateTimezone)
            ? candidateTimezone
            : undefined;

    const shiftedValue = useMemo(() => {
        if (!projectTimezone || !value) return value;
        return shiftToProjectTimezone(value, projectTimezone);
    }, [value, projectTimezone]);

    const handleChange = useCallback(
        (date: Date | null) => {
            if (!date) return;
            const milliseconds = value?.getMilliseconds() ?? 0;
            if (!projectTimezone) {
                date.setMilliseconds(milliseconds);
                onChange(date);
                return;
            }
            const unshiftedDate = unshiftFromProjectTimezone(
                date,
                projectTimezone,
            );
            unshiftedDate.setMilliseconds(milliseconds);
            onChange(unshiftedDate);
        },
        [onChange, projectTimezone, value],
    );

    const browserTimezone = useMemo(() => dayjs.tz.guess(), []);
    const subtext = useMemo(() => {
        if (!value) return '';
        if (projectTimezone) {
            return `${t(
                'components_common_filters_inputs.local_time',
            )} (${browserTimezone}): ${dayjs(value)
                .tz(browserTimezone)
                .format(SUBTEXT_DATE_FORMAT)}`;
        }
        return `${t(
            'components_common_filters_inputs.utc_time',
        )}: ${dayjs(value).utc().format(SUBTEXT_DATE_FORMAT)}`;
    }, [value, projectTimezone, browserTimezone, t]);

    const sideLabel = projectTimezone
        ? (getTimezoneLabel(projectTimezone) ?? projectTimezone)
        : browserTimezone;

    return (
        <Group noWrap spacing="xs" align="start" w="100%">
            {/* // FIXME: until mantine 7.4: https://github.com/mantinedev/mantine/issues/5401#issuecomment-1874906064
            // @ts-ignore */}
            <DateTimePicker
                size="xs"
                w="100%"
                miw={185}
                valueFormat={displayFormat}
                {...rest}
                popoverProps={{ shadow: 'sm', ...rest.popoverProps }}
                firstDayOfWeek={firstDayOfWeek}
                value={shiftedValue}
                onChange={handleChange}
                inputWrapperOrder={['input', 'description']}
                description={
                    <Text ml="two">
                        {subtext}
                    </Text>
                }
            />
            {showTimezone && (
                <Text
                    size="xs"
                    color="dimmed"
                    mt={7}
                    sx={{ whiteSpace: 'nowrap' }}
                >
                    {sideLabel}
                </Text>
            )}
        </Group>
    );
};

export default FilterDateTimePicker;
