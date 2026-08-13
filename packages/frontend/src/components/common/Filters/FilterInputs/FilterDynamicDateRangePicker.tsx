import {
    TimeFrames,
    UnitOfTime,
    formatDate,
    parseDate,
    resolveDateRangeBound,
    type BaseFilterRule,
    type DateRangeBoundSetting,
    type DateRangeDirection,
    type DateRangeMode,
    type DateRangeSetting,
    type FilterRule,
} from '@lightdash/common';
import { Flex, NumberInput, Radio, Select, Stack, Text } from '@mantine/core';
import { type DayOfWeek } from '@mantine/dates';
import dayjs from 'dayjs';
import { useCallback, type FC } from 'react';
import { useTranslation } from 'react-i18next';

import FilterDateRangePicker from './FilterDateRangePicker';
import FilterMonthAndYearPicker from './FilterMonthAndYearPicker';
import FilterQuarterPicker from './FilterQuarterPicker';
import FilterYearPicker from './FilterYearPicker';

type DateRangeRule = BaseFilterRule & {
    values?: (string | null)[];
    settings?: FilterRule['settings'] & {
        dateRange?: DateRangeSetting;
    };
};

type Props = {
    rule: DateRangeRule;
    onChange: (next: DateRangeRule) => void;
    firstDayOfWeek: DayOfWeek;
    granularity: TimeFrames;
    filterMinDate?: Date;
    filterMaxDate?: Date;
    disabled?: boolean;
};

const DEFAULT_DIRECTION: DateRangeDirection = 'ago';
const DEFAULT_START: Required<DateRangeBoundSetting> = {
    direction: 'ago',
    count: 12,
    unit: UnitOfTime.months,
};
const DEFAULT_END: Required<DateRangeBoundSetting> = {
    direction: 'ago',
    count: 1,
    unit: UnitOfTime.months,
};

const isMode = (value: string | null): value is DateRangeMode =>
    value === 'fixed' || value === 'dynamic';

const isDirection = (value: string | null): value is DateRangeDirection =>
    value === 'ago' || value === 'later';

const unitOfTimeOptions: Array<{ value: UnitOfTime; labelKey: string }> = [
    { value: UnitOfTime.days, labelKey: 'days' },
    { value: UnitOfTime.weeks, labelKey: 'weeks' },
    { value: UnitOfTime.months, labelKey: 'months' },
    { value: UnitOfTime.quarters, labelKey: 'quarters' },
    { value: UnitOfTime.years, labelKey: 'years' },
];

const parseCount = (raw: unknown): number => {
    if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
    if (typeof raw === 'string') {
        const n = Number(raw);
        return Number.isFinite(n) ? n : 1;
    }
    return 1;
};

const parseValueAsDate = (
    raw: string | null | undefined,
    _granularity: TimeFrames,
): Date | null => {
    if (raw == null || raw === '') return null;
    // Values are always stored as YYYY-MM-DD (regardless of granularity), so
    // always parse with DAY format.
    const parsed = parseDate(raw, TimeFrames.DAY);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const formatValueFromDate = (
    date: Date | null,
    granularity: TimeFrames,
): string | null => {
    if (date == null) return null;
    // Always store as YYYY-MM-DD (the format the SQL compiler expects), but
    // round to the period boundary for non-day granularities so the stored
    // value is a valid start/end of the picked period.
    const d = dayjs(date);
    if (granularity === TimeFrames.MONTH) {
        return d.startOf('month').format('YYYY-MM-DD');
    }
    if (granularity === TimeFrames.QUARTER) {
        return d.startOf('quarter').format('YYYY-MM-DD');
    }
    if (granularity === TimeFrames.YEAR) {
        return d.startOf('year').format('YYYY-MM-DD');
    }
    return formatDate(date, TimeFrames.DAY);
};

/**
 * Resolve a dynamic DateRangeSetting into [startStr, endStr] so that the
 * `values` array always reflects the current dynamic configuration. The SQL
 * compiler re-resolves from `settings.dateRange` at query time (so dates stay
 * fresh), but `values` must also be populated for validation
 * (`hasFilterValueSet`) and for any code path that reads `values` directly.
 */
const resolveDynamicValues = (
    dateRange: DateRangeSetting,
    granularity: TimeFrames,
): string[] => {
    const start = resolveDateRangeBound(dateRange.start);
    const end = resolveDateRangeBound(dateRange.end);
    const values: string[] = [];
    const startStr = start ? formatValueFromDate(start, granularity) : null;
    const endStr = end ? formatValueFromDate(end, granularity) : null;
    if (startStr) values.push(startStr);
    if (endStr) values.push(endStr);
    return values;
};

const FilterDynamicDateRangePicker: FC<Props> = ({
    rule,
    onChange,
    firstDayOfWeek,
    granularity,
    filterMinDate,
    filterMaxDate,
    disabled,
}) => {
    const { t } = useTranslation();

    const dateRangeSetting: DateRangeSetting = rule.settings?.dateRange ?? {};
    const mode: DateRangeMode = isMode(dateRangeSetting.mode ?? null)
        ? (dateRangeSetting.mode as DateRangeMode)
        : 'fixed';

    const startSetting: DateRangeBoundSetting = {
        direction: isDirection(dateRangeSetting.start?.direction ?? null)
            ? dateRangeSetting.start?.direction
            : DEFAULT_DIRECTION,
        count: parseCount(dateRangeSetting.start?.count),
        unit: dateRangeSetting.start?.unit ?? DEFAULT_START.unit,
    };
    const endSetting: DateRangeBoundSetting = {
        direction: isDirection(dateRangeSetting.end?.direction ?? null)
            ? dateRangeSetting.end?.direction
            : DEFAULT_DIRECTION,
        count: parseCount(dateRangeSetting.end?.count),
        unit: dateRangeSetting.end?.unit ?? DEFAULT_END.unit,
    };

    const writeDateRangeSetting = useCallback(
        (next: DateRangeSetting) => {
            // When in dynamic mode, also resolve and write `values` so that
            // validation (hasFilterValueSet) and any code reading `values`
            // directly sees the correct dates. The SQL compiler re-resolves
            // from settings.dateRange at query time, so these resolved values
            // are just for immediate consumption.
            const nextValues =
                next.mode === 'dynamic'
                    ? resolveDynamicValues(next, granularity)
                    : rule.values;
            onChange({
                ...rule,
                values: nextValues,
                settings: {
                    ...rule.settings,
                    dateRange: next,
                },
            });
        },
        [onChange, rule, granularity],
    );

    const handleModeChange = (nextMode: DateRangeMode) => {
        if (nextMode === mode) return;
        if (nextMode === 'dynamic') {
            // Switching to dynamic: seed defaults so the user has a
            // sensible starting point (last 12 months -> last 1 month).
            writeDateRangeSetting({
                mode: 'dynamic',
                start: { ...startSetting },
                end: { ...endSetting },
            });
        } else {
            // Switching to fixed: drop the dynamic config. Existing
            // `values` (if any) continue to drive the fixed pickers.
            const { dateRange: _drop, ...restSettings } =
                (rule.settings as DateRangeRule['settings']) ?? {};
            onChange({
                ...rule,
                settings: restSettings,
            });
        }
    };

    const handleBoundChange = (
        bound: 'start' | 'end',
        patch: Partial<DateRangeBoundSetting>,
    ) => {
        const current = bound === 'start' ? startSetting : endSetting;
        writeDateRangeSetting({
            ...dateRangeSetting,
            mode: 'dynamic',
            [bound]: { ...current, ...patch },
        });
    };

    const directionOptions = [
        {
            value: 'ago',
            label: t(
                'components_common_filters_inputs.date_range.dynamic.direction.ago',
            ),
        },
        {
            value: 'later',
            label: t(
                'components_common_filters_inputs.date_range.dynamic.direction.later',
            ),
        },
    ];

    const unitOptions = unitOfTimeOptions.map((opt) => ({
        value: opt.value,
        label: t(
            `components_common_filters_inputs.date_range.dynamic.unit.${opt.labelKey}`,
        ),
    }));

    const renderBoundRow = (
        bound: 'start' | 'end',
        labelKey: string,
        setting: DateRangeBoundSetting,
    ) => (
        <Flex key={bound} gap="xs" wrap="nowrap" align="center">
            <Text size="xs" w={60} c="dimmed">
                {t(labelKey)}
            </Text>
            <Select
                size="xs"
                data={directionOptions}
                value={
                    isDirection(setting.direction ?? null)
                        ? setting.direction
                        : DEFAULT_DIRECTION
                }
                onChange={(value) => {
                    if (!isDirection(value)) return;
                    handleBoundChange(bound, { direction: value });
                }}
                disabled={disabled}
                allowDeselect={false}
                w={80}
            />
            <NumberInput
                size="xs"
                value={setting.count ?? 1}
                min={1}
                max={9999}
                hideControls
                w={64}
                disabled={disabled}
                onChange={(value) => {
                    const n =
                        typeof value === 'number'
                            ? value
                            : Number.parseInt(String(value ?? ''), 10);
                    handleBoundChange(bound, {
                        count: Number.isFinite(n) && n > 0 ? n : 1,
                    });
                }}
            />
            <Select
                size="xs"
                data={unitOptions}
                value={setting.unit ?? DEFAULT_START.unit}
                onChange={(value) => {
                    if (
                        value === UnitOfTime.days ||
                        value === UnitOfTime.weeks ||
                        value === UnitOfTime.months ||
                        value === UnitOfTime.quarters ||
                        value === UnitOfTime.years
                    ) {
                        handleBoundChange(bound, { unit: value });
                    }
                }}
                disabled={disabled}
                allowDeselect={false}
                w={88}
            />
        </Flex>
    );

    // ---- Fixed-date mode UI ----
    // Parse existing values back to Date objects. The rule is always allowed
    // to have any number of values; missing slots are null.
    const fixedStart = parseValueAsDate(
        rule.values?.[0] as string | null | undefined,
        granularity,
    );
    const fixedEnd = parseValueAsDate(
        rule.values?.[1] as string | null | undefined,
        granularity,
    );

    const writeFixed = (next: [Date | null, Date | null]) => {
        const startStr = formatValueFromDate(next[0], granularity);
        const endStr = formatValueFromDate(next[1], granularity);
        const values: (string | null)[] = [];
        if (startStr != null) values.push(startStr);
        if (endStr != null) values.push(endStr);
        onChange({ ...rule, values });
    };

    const renderFixedPicker = () => {
        if (granularity === TimeFrames.MONTH) {
            return (
                <Flex gap="xs" wrap="nowrap" align="center">
                    <FilterMonthAndYearPicker
                        size="xs"
                        disabled={disabled}
                        value={fixedStart}
                        minDate={filterMinDate}
                        maxDate={fixedEnd ?? filterMaxDate}
                        // @ts-ignore - Mantine MonthPickerInput doesn't expose `placeholder`
                        placeholder={t(
                            'components_common_filters_inputs.date_range.dynamic.start_label',
                        )}
                        onChange={(d: Date | null) => writeFixed([d, fixedEnd])}
                    />
                    <Text c="dimmed" size="xs">
                        –
                    </Text>
                    <FilterMonthAndYearPicker
                        size="xs"
                        disabled={disabled}
                        value={fixedEnd}
                        minDate={fixedStart ?? filterMinDate}
                        maxDate={filterMaxDate}
                        // @ts-ignore - Mantine MonthPickerInput doesn't expose `placeholder`
                        placeholder={t(
                            'components_common_filters_inputs.date_range.dynamic.end_label',
                        )}
                        onChange={(d: Date | null) =>
                            writeFixed([fixedStart, d])
                        }
                    />
                </Flex>
            );
        }
        if (granularity === TimeFrames.QUARTER) {
            return (
                <Flex gap="xs" wrap="nowrap" align="center">
                    <FilterQuarterPicker
                        disabled={disabled}
                        value={fixedStart}
                        minDate={filterMinDate}
                        maxDate={fixedEnd ?? filterMaxDate}
                        placeholder={t(
                            'components_common_filters_inputs.date_range.dynamic.start_label',
                        )}
                        onChange={(d: Date | null) => writeFixed([d, fixedEnd])}
                    />
                    <Text c="dimmed" size="xs">
                        –
                    </Text>
                    <FilterQuarterPicker
                        disabled={disabled}
                        value={fixedEnd}
                        minDate={fixedStart ?? filterMinDate}
                        maxDate={filterMaxDate}
                        placeholder={t(
                            'components_common_filters_inputs.date_range.dynamic.end_label',
                        )}
                        onChange={(d: Date | null) =>
                            writeFixed([fixedStart, d])
                        }
                    />
                </Flex>
            );
        }
        if (granularity === TimeFrames.YEAR) {
            return (
                <Flex gap="xs" wrap="nowrap" align="center">
                    <FilterYearPicker
                        size="xs"
                        disabled={disabled}
                        value={fixedStart}
                        minDate={filterMinDate}
                        maxDate={fixedEnd ?? filterMaxDate}
                        // @ts-ignore - Mantine YearPickerInput doesn't expose `placeholder`
                        placeholder={t(
                            'components_common_filters_inputs.date_range.dynamic.start_label',
                        )}
                        onChange={(d: Date | null) => writeFixed([d, fixedEnd])}
                    />
                    <Text c="dimmed" size="xs">
                        –
                    </Text>
                    <FilterYearPicker
                        size="xs"
                        disabled={disabled}
                        value={fixedEnd}
                        minDate={fixedStart ?? filterMinDate}
                        maxDate={filterMaxDate}
                        // @ts-ignore - Mantine YearPickerInput doesn't expose `placeholder`
                        placeholder={t(
                            'components_common_filters_inputs.date_range.dynamic.end_label',
                        )}
                        onChange={(d: Date | null) =>
                            writeFixed([fixedStart, d])
                        }
                    />
                </Flex>
            );
        }
        // Day granularity
        return (
            <FilterDateRangePicker
                size="xs"
                disabled={disabled}
                firstDayOfWeek={firstDayOfWeek}
                filterMinDate={filterMinDate}
                filterMaxDate={filterMaxDate}
                value={fixedStart && fixedEnd ? [fixedStart, fixedEnd] : null}
                onChange={(v) => writeFixed([v?.[0] ?? null, v?.[1] ?? null])}
            />
        );
    };

    return (
        <Stack spacing="xs" w="100%">
            <Radio.Group
                value={mode}
                onChange={(value) => {
                    if (isMode(value)) handleModeChange(value);
                }}
            >
                <Stack spacing={4}>
                    <Radio
                        value="dynamic"
                        size="xs"
                        disabled={disabled}
                        label={t(
                            'components_common_filters_inputs.date_range.dynamic.custom_label',
                        )}
                    />
                    {mode === 'dynamic' && (
                        <Stack spacing={4} pl="lg">
                            {renderBoundRow(
                                'start',
                                'components_common_filters_inputs.date_range.dynamic.start_label',
                                startSetting,
                            )}
                            {renderBoundRow(
                                'end',
                                'components_common_filters_inputs.date_range.dynamic.end_label',
                                endSetting,
                            )}
                        </Stack>
                    )}
                    <Radio
                        value="fixed"
                        size="xs"
                        disabled={disabled}
                        label={t(
                            'components_common_filters_inputs.date_range.dynamic.fixed_label',
                        )}
                    />
                    {mode === 'fixed' && (
                        <Stack spacing={4} pl="lg">
                            {renderFixedPicker()}
                        </Stack>
                    )}
                </Stack>
            </Radio.Group>
        </Stack>
    );
};

export default FilterDynamicDateRangePicker;
