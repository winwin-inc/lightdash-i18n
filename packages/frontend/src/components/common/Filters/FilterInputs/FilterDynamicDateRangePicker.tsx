import {
    TimeFrames,
    UnitOfTime,
    formatDate,
    isDateRangeDynamic,
    parseDate,
    resolveDateRangeBound,
    type BaseFilterRule,
    type DateRangeBoundSetting,
    type DateRangeDirection,
    type DateRangeMode,
    type DateRangeSetting,
    type FilterRule,
} from '@lightdash/common';
import {
    Flex,
    NumberInput,
    Radio,
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
    { value: UnitOfTime.months, labelKey: 'months' },
    { value: UnitOfTime.quarters, labelKey: 'quarters' },
];

/**
 * Dynamic date range is only enabled for month / quarter granularity.
 * Day / year granularities hide the "Dynamic Date" radio entirely and use
 * fixed dates only.
 */
const isDynamicAllowed = (granularity: TimeFrames): boolean =>
    granularity === TimeFrames.MONTH || granularity === TimeFrames.QUARTER;

/**
 * Map the picker's date-range granularity to the dynamic unit it must use.
 * Month granularity → months, Quarter granularity → quarters, and the user
 * cannot change it.
 */
const getLockedDynamicUnit = (
    granularity: TimeFrames,
): UnitOfTime | undefined => {
    if (granularity === TimeFrames.MONTH) return UnitOfTime.months;
    if (granularity === TimeFrames.QUARTER) return UnitOfTime.quarters;
    return undefined;
};

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
    const startStr = start
        ? formatValueFromDate(start, granularity, false)
        : null;
    const endStr = end ? formatValueFromDate(end, granularity, true) : null;
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
    isEditMode,
    popoverProps,
}) => {
    const { t } = useTranslation();

    const dynamicAllowed = isDynamicAllowed(granularity);
    const lockedUnit = getLockedDynamicUnit(granularity);

    const dateRangeSetting: DateRangeSetting = rule.settings?.dateRange ?? {};
    // If dynamic mode is not allowed but the rule somehow carries a dynamic
    // config, treat it as fixed so the UI never shows the dynamic radio.
    const mode: DateRangeMode = !dynamicAllowed
        ? 'fixed'
        : isMode(dateRangeSetting.mode ?? null)
        ? (dateRangeSetting.mode as DateRangeMode)
        : 'fixed';

    // Force unit to the locked value based on granularity (months for month
    // granularity, quarters for quarter granularity). Users cannot change
    // the unit, but existing storage might have stale units so we normalise.
    const coerceUnit = (
        raw: UnitOfTime | undefined,
        fallback: UnitOfTime,
    ): UnitOfTime => lockedUnit ?? raw ?? fallback;

    const startSetting: DateRangeBoundSetting = {
        direction: isDirection(dateRangeSetting.start?.direction ?? null)
            ? dateRangeSetting.start?.direction
            : DEFAULT_DIRECTION,
        count: parseCount(dateRangeSetting.start?.count),
        unit: coerceUnit(dateRangeSetting.start?.unit, DEFAULT_START.unit),
    };
    const endSetting: DateRangeBoundSetting = {
        direction: isDirection(dateRangeSetting.end?.direction ?? null)
            ? dateRangeSetting.end?.direction
            : DEFAULT_DIRECTION,
        count: parseCount(dateRangeSetting.end?.count),
        unit: coerceUnit(dateRangeSetting.end?.unit, DEFAULT_END.unit),
    };

    const writeDateRangeSetting = useCallback(
        (next: DateRangeSetting) => {
            // Coerce units FIRST, then resolve values with the coerced
            // settings. This ensures that when the granularity changes
            // (e.g. month → quarter), the stored unit is corrected before
            // resolveDynamicValues computes the dates.
            const coercedNext: DateRangeSetting = {
                ...next,
                start: next.start
                    ? {
                          ...next.start,
                          unit: coerceUnit(next.start.unit, DEFAULT_START.unit),
                      }
                    : next.start,
                end: next.end
                    ? {
                          ...next.end,
                          unit: coerceUnit(next.end.unit, DEFAULT_END.unit),
                      }
                    : next.end,
            };
            const nextValues =
                coercedNext.mode === 'dynamic'
                    ? resolveDynamicValues(coercedNext, granularity)
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
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [onChange, rule, granularity, lockedUnit],
    );

    const handleModeChange = (nextMode: DateRangeMode) => {
        if (nextMode === mode) return;
        if (!dynamicAllowed && nextMode === 'dynamic') return;
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
        // Don't let the patch override the unit to anything outside the
        // locked granularity unit.
        const safePatch: Partial<DateRangeBoundSetting> = {
            ...patch,
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
                    // Safe guard: unitOfTimeOptions only contains months and
                    // quarters, but handleBoundaryChange also enforces the
                    // locked granularity unit on top.
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
        </Flex>
    );

    // ---- Fixed-date mode UI ----
    // In view mode with a dynamic date range, re-resolve the dates from
    // settings.dateRange using the current date so the displayed values are
    // always "fresh" (e.g. "last 12 months" shifts as months pass).
    // In edit mode, or when not dynamic, use the stored values directly.
    const viewModeDynamicValues = useMemo(() => {
        if (isEditMode || !isDateRangeDynamic(rule)) return null;
        const dr = (rule.settings as { dateRange?: DateRangeSetting })
            ?.dateRange;
        if (!dr) return null;
        return resolveDynamicValues(dr, granularity);
    }, [isEditMode, rule, granularity]);

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

    // Day / year granularity OR view mode: no dynamic option, just render
    // the fixed pickers. In view mode the `values` array already contains
    // the dynamically resolved dates (written at config time), so the user
    // sees concrete dates they can adjust — identical to the pre-dynamic
    // behaviour.
    if (!dynamicAllowed || !isEditMode) {
        return (
            <Stack spacing="xs" w="100%">
                {renderFixedPicker()}
            </Stack>
        );
    }

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
