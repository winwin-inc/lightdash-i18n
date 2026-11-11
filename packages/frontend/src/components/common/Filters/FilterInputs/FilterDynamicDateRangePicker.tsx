import {
    TimeFrames,
    UnitOfTime,
    formatDate,
    isDateRangeDynamic,
    parseDate,
    type BaseFilterRule,
    type DateRangeBoundSetting,
    type DateRangeSetting,
    type FilterRule,
} from '@lightdash/common';
import {
    Flex,
    NumberInput,
    Select,
    Stack,
    Text,
    type PopoverProps,
} from '@mantine/core';
import { type DayOfWeek } from '@mantine/dates';
import dayjs from 'dayjs';
import quarterOfYear from 'dayjs/plugin/quarterOfYear';
import { useCallback, useMemo, type FC } from 'react';
import { useTranslation } from 'react-i18next';

import FilterDateRangePicker from './FilterDateRangePicker';
import FilterMonthAndYearPicker from './FilterMonthAndYearPicker';
import FilterQuarterPicker from './FilterQuarterPicker';
import FilterYearPicker from './FilterYearPicker';
import {
    DYNAMIC_DATE_RANGE_DEFAULT_END,
    DYNAMIC_DATE_RANGE_DEFAULT_START,
    getLockedDynamicUnit,
    isDynamicDateRangeAllowed,
    normalizeDateRangeSetting,
    parseDateRangeCount,
    resolveDateRangeMode,
    resolveDynamicDateRangeValues,
} from './dateRangeMode';
import { getDateRangeRuleWithFixedValues, resolveDisplayValues } from './utils';

dayjs.extend(quarterOfYear);

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
    /** true = 编辑模式（配置默认值），false / undefined = 查看模式 */
    isEditMode?: boolean;
    popoverProps?: Omit<PopoverProps, 'children'>;
};

const unitOfTimeOptions: Array<{ value: UnitOfTime; labelKey: string }> = [
    { value: UnitOfTime.months, labelKey: 'months' },
    { value: UnitOfTime.quarters, labelKey: 'quarters' },
];

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
    isEnd = false,
): string | null => {
    if (date == null) return null;
    // Always store as YYYY-MM-DD (the format the SQL compiler expects), but
    // round to the period boundary for non-day granularities so the stored
    // value is a valid start/end of the picked period.
    const d = dayjs(date);
    if (granularity === TimeFrames.MONTH) {
        return (isEnd ? d.endOf('month') : d.startOf('month')).format(
            'YYYY-MM-DD',
        );
    }
    if (granularity === TimeFrames.QUARTER) {
        return (isEnd ? d.endOf('quarter') : d.startOf('quarter')).format(
            'YYYY-MM-DD',
        );
    }
    if (granularity === TimeFrames.YEAR) {
        return (isEnd ? d.endOf('year') : d.startOf('year')).format(
            'YYYY-MM-DD',
        );
    }
    return formatDate(date, TimeFrames.DAY);
};

const FilterDynamicDateRangePicker: FC<Props> = ({
    rule,
    onChange,
    firstDayOfWeek,
    granularity,
    filterMinDate,
    filterMaxDate,
    disabled,
    isEditMode,
    popoverProps,
}) => {
    const { t } = useTranslation();

    const dynamicAllowed = isDynamicDateRangeAllowed(granularity);
    const lockedUnit = getLockedDynamicUnit(granularity);

    const dateRangeSetting: DateRangeSetting = rule.settings?.dateRange ?? {};
    // If dynamic mode is not allowed but the rule somehow carries a dynamic
    // config, treat it as fixed so the UI never shows the dynamic branch.
    // The fixed ↔ dynamic mode switch itself lives in the dashboard filter
    // settings card (Radio at the top of the value section) for edit mode;
    // this component only renders the current mode's input body.
    const mode = resolveDateRangeMode(dateRangeSetting, granularity);

    // Force unit to the locked value based on granularity (months for month
    // granularity, quarters for quarter granularity). Users cannot change
    // the unit, but existing storage might have stale units so we normalise.
    const coerceUnit = (
        raw: UnitOfTime | undefined,
        fallback: UnitOfTime,
    ): UnitOfTime => lockedUnit ?? raw ?? fallback;

    const startSetting: DateRangeBoundSetting = {
        direction: 'ago',
        count: parseDateRangeCount(dateRangeSetting.start?.count),
        unit: coerceUnit(
            dateRangeSetting.start?.unit,
            DYNAMIC_DATE_RANGE_DEFAULT_START.unit,
        ),
    };
    const endSetting: DateRangeBoundSetting = {
        direction: 'ago',
        count: parseDateRangeCount(dateRangeSetting.end?.count),
        unit: coerceUnit(
            dateRangeSetting.end?.unit,
            DYNAMIC_DATE_RANGE_DEFAULT_END.unit,
        ),
    };

    const writeDateRangeSetting = useCallback(
        (next: DateRangeSetting) => {
            // Coerce units FIRST, then resolve values with the coerced
            // settings. This ensures that when the granularity changes
            // (e.g. month → quarter), the stored unit is corrected before
            // resolveDynamicDateRangeValues computes the dates.
            const coercedNext = normalizeDateRangeSetting(next, lockedUnit);
            const nextValues =
                coercedNext.mode === 'dynamic'
                    ? resolveDynamicDateRangeValues(coercedNext, granularity)
                    : rule.values;
            onChange({
                ...rule,
                values: nextValues,
                settings: {
                    ...rule.settings,
                    dateRange: coercedNext,
                },
            });
        },
        [onChange, rule, granularity, lockedUnit],
    );

    const handleBoundChange = (
        bound: 'start' | 'end',
        patch: Partial<DateRangeBoundSetting>,
    ) => {
        // Don't let the patch override the unit to anything outside the
        // locked granularity unit.
        const safePatch: Partial<DateRangeBoundSetting> = {
            ...patch,
            direction: 'ago',
            ...(lockedUnit ? { unit: lockedUnit } : {}),
        };
        // Build next from startSetting / endSetting (which already have
        // coerced units) instead of dateRangeSetting (which may carry stale
        // units from a previous granularity).
        writeDateRangeSetting({
            mode: 'dynamic',
            start:
                bound === 'start'
                    ? { ...startSetting, ...safePatch }
                    : startSetting,
            end: bound === 'end' ? { ...endSetting, ...safePatch } : endSetting,
        });
    };

    const unitOptions = unitOfTimeOptions.map((opt) => ({
        value: opt.value,
        label: t(
            `components_common_filters_inputs.date_range.dynamic.unit.${opt.labelKey}`,
        ),
    }));
    const unitDisabled = lockedUnit != null;

    const renderBoundRow = (
        bound: 'start' | 'end',
        labelKey: string,
        setting: DateRangeBoundSetting,
    ) => (
        <Flex key={bound} gap="xs" wrap="nowrap" align="center">
            <Text size="xs" w={60} c="dimmed">
                {t(labelKey)}
            </Text>
            <NumberInput
                size="xs"
                value={setting.count ?? 1}
                min={0}
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
                        count: Number.isFinite(n) && n >= 0 ? n : 0,
                    });
                }}
            />
            <Select
                size="xs"
                data={unitOptions}
                value={setting.unit ?? DYNAMIC_DATE_RANGE_DEFAULT_START.unit}
                onChange={(value) => {
                    if (
                        value === UnitOfTime.months ||
                        value === UnitOfTime.quarters
                    ) {
                        handleBoundChange(bound, { unit: value });
                    }
                }}
                disabled={disabled || unitDisabled}
                allowDeselect={false}
                w={88}
            />
            <Text size="xs" c="dimmed">
                {t(
                    'components_common_filters_inputs.date_range.dynamic.direction.ago',
                )}
            </Text>
        </Flex>
    );

    // ---- Fixed-date mode UI ----
    const viewModeDynamicValues = useMemo(() => {
        if (isEditMode || !isDateRangeDynamic(rule)) return null;
        return resolveDisplayValues(rule);
    }, [isEditMode, rule]);

    const fixedStart = parseValueAsDate(
        (viewModeDynamicValues?.[0] ?? rule.values?.[0]) as
            | string
            | null
            | undefined,
        granularity,
    );
    const fixedEnd = parseValueAsDate(
        (viewModeDynamicValues?.[1] ?? rule.values?.[1]) as
            | string
            | null
            | undefined,
        granularity,
    );

    const writeFixed = (next: [Date | null, Date | null]) => {
        const startStr = formatValueFromDate(next[0], granularity, false);
        const endStr = formatValueFromDate(next[1], granularity, true);
        // Keep start/end as positional slots so clearing one bound does not
        // shift the other into values[0].
        const values = [startStr ?? '', endStr ?? ''];
        const ruleWithValues = { ...rule, values };
        onChange(
            isEditMode
                ? ruleWithValues
                : getDateRangeRuleWithFixedValues(ruleWithValues),
        );
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
                        popoverProps={popoverProps}
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
                        popoverProps={popoverProps}
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
                        popoverProps={popoverProps}
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
                        popoverProps={popoverProps}
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
                        popoverProps={popoverProps}
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
                        popoverProps={popoverProps}
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
                popoverProps={popoverProps}
                value={fixedStart && fixedEnd ? [fixedStart, fixedEnd] : null}
                onChange={(v) => writeFixed([v?.[0] ?? null, v?.[1] ?? null])}
            />
        );
    };

    // The mode Radio lives in the dashboard filter settings card; this
    // component renders only the current mode's input body. View mode (and
    // day / year granularity) always renders fixed pickers — for dynamic
    // rules in view mode the resolved display values are shown.
    const showDynamicRows = isEditMode && dynamicAllowed && mode === 'dynamic';
    if (showDynamicRows) {
        return (
            <Stack spacing={4} w="100%">
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
        );
    }
    return (
        <Stack spacing="xs" w="100%">
            {renderFixedPicker()}
        </Stack>
    );
};

export default FilterDynamicDateRangePicker;
