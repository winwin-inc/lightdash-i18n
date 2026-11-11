import {
    FilterOperator,
    isRollingMinAllowedMonthsActive,
    isValidRollingMinAllowedMonths,
    ROLLING_MIN_ALLOWED_MONTHS_MAX,
    ROLLING_MIN_ALLOWED_MONTHS_MIN,
    TimeFrames,
    type DashboardFilterRule,
} from '@lightdash/common';
import {
    Box,
    Group,
    NumberInput,
    Stack,
    Switch,
    Text,
    Tooltip,
    type PopoverProps,
} from '@mantine/core';
import { IconHelpCircle } from '@tabler/icons-react';
import dayjs from 'dayjs';
import { useMemo, type FC, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import FilterDatePicker from '../../common/Filters/FilterInputs/FilterDatePicker';
import FilterMonthAndYearPicker from '../../common/Filters/FilterInputs/FilterMonthAndYearPicker';
import FilterQuarterPicker from '../../common/Filters/FilterInputs/FilterQuarterPicker';
import FilterYearPicker from '../../common/Filters/FilterInputs/FilterYearPicker';
import {
    resolveDateRangeMode,
} from '../../common/Filters/FilterInputs/dateRangeMode';
import useFiltersContext from '../../common/Filters/useFiltersContext';
import {
    getFirstDayOfWeek,
    resolveRuleBounds,
} from '../../common/Filters/utils/filterDateUtils';
import MantineIcon from '../../common/MantineIcon';

type Props = {
    filterRule: DashboardFilterRule;
    popoverProps?: Omit<PopoverProps, 'children'>;
    onChangeFilterRule: (value: DashboardFilterRule) => void;
};

/** Window size seeded when the rolling-earliest switch is first enabled. */
const DEFAULT_ROLLING_MIN_ALLOWED_MONTHS = 12;

/**
 * ⓘ tooltip with keyboard access (focusable via tabIndex, focus shows the
 * Mantine tooltip). Replaces the former long-form hint/description texts.
 */
/** 对齐「类目层级」label 后的帮助图标：默认色 IconHelpCircle，hover/focus 显示说明 */
const InfoTooltip: FC<{ label: string; children?: ReactNode }> = ({
    label,
    children,
}) => (
    <Tooltip
        withinPortal
        variant="xs"
        multiline
        maw={280}
        position="top"
        label={label}
    >
        {children ?? (
            <Box
                component="span"
                display="inline-flex"
                tabIndex={0}
                sx={{ cursor: 'help', outline: 'none' }}
            >
                <MantineIcon size="sm" icon={IconHelpCircle} />
            </Box>
        )}
    </Tooltip>
);

const DateRangeConstraintEditor: FC<Props> = ({
    filterRule,
    popoverProps,
    onChangeFilterRule,
}) => {
    const { t } = useTranslation();
    const { startOfWeek } = useFiltersContext();

    // Granularity used by the min/max pickers.
    // - For IN_BETWEEN / NOT_IN_BETWEEN: the user-chosen dateRangeGranularity
    //   (set via the date selector) drives the picker type so e.g. a month
    //   range filter gets month pickers for min/max too.
    // - For every other operator the min/max are always day pickers. The
    //   date selector is hidden in those operators anyway, so the only sane
    //   default is DAY.
    const isRangeOperator =
        filterRule.operator === FilterOperator.IN_BETWEEN ||
        filterRule.operator === FilterOperator.NOT_IN_BETWEEN;
    const granularity = isRangeOperator
        ? filterRule.dateRangeGranularity ?? TimeFrames.DAY
        : TimeFrames.DAY;

    const isDynamicMode =
        resolveDateRangeMode(filterRule.settings?.dateRange, granularity) ===
        'dynamic';

    const showDynamicMaxSwitch =
        filterRule.operator === FilterOperator.IN_BETWEEN &&
        (granularity === TimeFrames.MONTH ||
            granularity === TimeFrames.QUARTER);

    // Rolling earliest bound ("last N months") is month + IN_BETWEEN only —
    // the quarter picker's alignment is not rolling-safe (see design doc §3.2).
    const showRollingWindowInput =
        filterRule.operator === FilterOperator.IN_BETWEEN &&
        granularity === TimeFrames.MONTH;
    const rollingConfigured = filterRule.rollingMinAllowedMonths != null;

    // Effective selectable bounds — same resolution entry as the pickers'
    // graying (rolling lower bound merged with the fixed earliest date,
    // dynamic max when no fixed latest date). Runtime data-availability
    // delay (4th-of-month rule) applies, matching what viewers see.
    const effectiveBounds = useMemo(
        () => resolveRuleBounds(filterRule),
        [filterRule],
    );
    const rollingActive = isRollingMinAllowedMonthsActive({
        operator: filterRule.operator,
        dateRangeGranularity: granularity,
        rollingMinAllowedMonths: filterRule.rollingMinAllowedMonths,
    });
    // Fixed maxAllowedDate takes precedence over the dynamic max switch.
    const dynamicMaxInEffect =
        !filterRule.maxAllowedDate && !!filterRule.enableDynamicMaxAllowedDate;

    const handleRollingSwitchChange = (enabled: boolean) => {
        onChangeFilterRule({
            ...filterRule,
            rollingMinAllowedMonths: enabled
                ? isValidRollingMinAllowedMonths(
                      filterRule.rollingMinAllowedMonths,
                  )
                    ? filterRule.rollingMinAllowedMonths
                    : DEFAULT_ROLLING_MIN_ALLOWED_MONTHS
                : undefined,
        });
    };

    const handleRollingCountChange = (value: string | number) => {
        const n =
            typeof value === 'number'
                ? value
                : Number.parseInt(String(value ?? ''), 10);
        // Empty / non-numeric input: keep the last valid value while typing.
        if (!Number.isFinite(n)) return;
        const clamped = Math.min(
            ROLLING_MIN_ALLOWED_MONTHS_MAX,
            Math.max(ROLLING_MIN_ALLOWED_MONTHS_MIN, Math.round(n)),
        );
        onChangeFilterRule({
            ...filterRule,
            rollingMinAllowedMonths: clamped,
        });
    };

    const normalizeBoundaryValue = (d: Date | null, isMax: boolean) => {
        if (!d) return undefined;
        const date = dayjs(d);
        if (granularity === TimeFrames.MONTH) {
            return (isMax ? date.endOf('month') : date.startOf('month')).format(
                'YYYY-MM-DD',
            );
        }
        if (granularity === TimeFrames.YEAR) {
            return (isMax ? date.endOf('year') : date.startOf('year')).format(
                'YYYY-MM-DD',
            );
        }
        if (granularity === TimeFrames.QUARTER) {
            return (
                isMax ? date.endOf('quarter') : date.startOf('quarter')
            ).format('YYYY-MM-DD');
        }
        return date.format('YYYY-MM-DD');
    };

    const handleMinChange = (d: Date | null) => {
        const minStr = normalizeBoundaryValue(d, false);
        let maxStr = filterRule.maxAllowedDate;
        if (minStr && maxStr && dayjs(minStr).isAfter(dayjs(maxStr))) {
            maxStr = undefined;
        }
        onChangeFilterRule({
            ...filterRule,
            minAllowedDate: minStr,
            maxAllowedDate: maxStr,
        });
    };

    const handleMaxChange = (d: Date | null) => {
        const maxStr = normalizeBoundaryValue(d, true);
        let minStr = filterRule.minAllowedDate;
        if (minStr && maxStr && dayjs(minStr).isAfter(dayjs(maxStr))) {
            minStr = undefined;
        }
        onChangeFilterRule({
            ...filterRule,
            minAllowedDate: minStr,
            maxAllowedDate: maxStr,
        });
    };

    const minDateValue = filterRule.minAllowedDate
        ? dayjs(filterRule.minAllowedDate).toDate()
        : null;
    const maxDateValue = filterRule.maxAllowedDate
        ? dayjs(filterRule.maxAllowedDate).toDate()
        : null;

    const formatBadgeMonth = (d: Date) => dayjs(d).format('YYYY-MM');

    const labelWithHint = (key: 'min_label' | 'max_label') => {
        const hintKey = key === 'min_label' ? 'min_tooltip' : 'max_tooltip';
        return (
            <Group spacing="xs" noWrap mb={2} sx={{ flexWrap: 'nowrap' }}>
                <Text size="xs" fw={500}>
                    {t(
                        `components_dashboard_filter.configuration.date_range.${key}`,
                    )}
                </Text>
                <InfoTooltip
                    label={t(
                        `components_dashboard_filter.configuration.date_range.${hintKey}`,
                    )}
                />
            </Group>
        );
    };

    return (
        <Stack spacing="xs" mt={4}>
            {showRollingWindowInput && isDynamicMode && (
                <Stack spacing={4}>
                    <Group spacing="xs" noWrap align="center">
                        <Switch
                            size="xs"
                            labelPosition="right"
                            checked={rollingConfigured}
                            onChange={(e) =>
                                handleRollingSwitchChange(e.currentTarget.checked)
                            }
                            label={
                                <InfoTooltip
                                    label={t(
                                        'components_dashboard_filter.configuration.date_range.rolling_tooltip',
                                    )}
                                >
                                    <Text size="xs" fw={500}>
                                        {t(
                                            'components_dashboard_filter.configuration.date_range.rolling_label',
                                        )}
                                    </Text>
                                </InfoTooltip>
                            }
                        />
                        <InfoTooltip
                            label={t(
                                'components_dashboard_filter.configuration.date_range.rolling_tooltip',
                            )}
                        />
                    </Group>
                    {rollingConfigured && (
                        <Group spacing="xs" noWrap align="center">
                            <Text size="xs" c="dimmed">
                                {t(
                                    'components_dashboard_filter.configuration.date_range.rolling_near_label',
                                )}
                            </Text>
                            <NumberInput
                                size="xs"
                                w={44}
                                styles={{ input: { height: 26 } }}
                                min={ROLLING_MIN_ALLOWED_MONTHS_MIN}
                                max={ROLLING_MIN_ALLOWED_MONTHS_MAX}
                                step={1}
                                hideControls
                                value={filterRule.rollingMinAllowedMonths}
                                onChange={handleRollingCountChange}
                            />
                            <Text size="xs" c="dimmed">
                                {t(
                                    'components_dashboard_filter.configuration.date_range.rolling_unit_months',
                                )}
                            </Text>
                            {rollingActive &&
                                effectiveBounds.maxDate != null &&
                                (dynamicMaxInEffect ? (
                                    <Text size="xs" c="blue.6">
                                        {t(
                                            'components_dashboard_filter.configuration.date_range.rolling_badge_dynamic',
                                            {
                                                value: effectiveBounds.minDate
                                                    ? `${formatBadgeMonth(
                                                          effectiveBounds.minDate,
                                                      )} – ${formatBadgeMonth(
                                                          effectiveBounds.maxDate,
                                                      )}`
                                                    : formatBadgeMonth(
                                                          effectiveBounds.maxDate,
                                                      ),
                                            },
                                        )}
                                    </Text>
                                ) : (
                                    <Text size="xs" c="dimmed">
                                        {t(
                                            'components_dashboard_filter.configuration.date_range.rolling_badge_fixed',
                                        )}
                                    </Text>
                                ))}
                        </Group>
                    )}
                </Stack>
            )}
            {showRollingWindowInput &&
                isDynamicMode &&
                rollingConfigured &&
                rollingActive &&
                effectiveBounds.maxDate == null && (
                    // Rolling without any latest selectable month: the window
                    // cannot resolve. Save-time validation (S3) rejects this
                    // combination; surface it inline too.
                    // P3-2：无效 N（0/NaN，API/as-code 注入）时 rollingActive
                    // 为 false —— 不显示红字（有 max 也不是 requires_max），
                    // 避免误导；仅真正激活但无最晚可选月时提示
                    <Text size="xs" c="red">
                        {t(
                            'components_dashboard_filter.configuration.date_range.rolling_requires_max',
                        )}
                    </Text>
                )}
            {showDynamicMaxSwitch && isDynamicMode && (
                <Group spacing="xs" noWrap align="center">
                    <Switch
                        size="xs"
                        labelPosition="right"
                        checked={!!filterRule.enableDynamicMaxAllowedDate}
                        onChange={(e) => {
                            const enabled = e.currentTarget.checked;
                            onChangeFilterRule({
                                ...filterRule,
                                enableDynamicMaxAllowedDate:
                                    enabled || undefined,
                                maxAllowedDate: enabled
                                    ? undefined
                                    : filterRule.maxAllowedDate,
                            });
                        }}
                        label={
                            <InfoTooltip
                                label={t(
                                    'components_dashboard_filter.configuration.date_range.dynamic_max_tooltip',
                                )}
                            >
                                <Text size="xs" fw={500}>
                                    {t(
                                        'components_dashboard_filter.configuration.date_range.dynamic_max_label',
                                    )}
                                </Text>
                            </InfoTooltip>
                        }
                    />
                    <InfoTooltip
                        label={t(
                            'components_dashboard_filter.configuration.date_range.dynamic_max_tooltip',
                        )}
                    />
                </Group>
            )}
            {!(granularity === TimeFrames.MONTH && isDynamicMode) && (
            <Group noWrap align="flex-start">
                {granularity === TimeFrames.MONTH ? (
                    <>
                        <FilterMonthAndYearPicker
                            clearable
                            w={160}
                            label={labelWithHint('min_label')}
                            value={minDateValue}
                            maxDate={maxDateValue ?? undefined}
                            popoverProps={{
                                shadow: 'sm',
                                ...popoverProps,
                            }}
                            onChange={handleMinChange}
                        />
                        <FilterMonthAndYearPicker
                            clearable
                            w={160}
                            label={labelWithHint('max_label')}
                            value={maxDateValue}
                            minDate={minDateValue ?? undefined}
                            popoverProps={{
                                shadow: 'sm',
                                ...popoverProps,
                            }}
                            onChange={handleMaxChange}
                        />
                    </>
                ) : granularity === TimeFrames.YEAR ? (
                    <>
                        <FilterYearPicker
                            clearable
                            w={160}
                            label={labelWithHint('min_label')}
                            value={minDateValue}
                            maxDate={maxDateValue ?? undefined}
                            popoverProps={{
                                shadow: 'sm',
                                ...popoverProps,
                            }}
                            onChange={handleMinChange}
                        />
                        <FilterYearPicker
                            clearable
                            w={160}
                            label={labelWithHint('max_label')}
                            value={maxDateValue}
                            minDate={minDateValue ?? undefined}
                            popoverProps={{
                                shadow: 'sm',
                                ...popoverProps,
                            }}
                            onChange={handleMaxChange}
                        />
                    </>
                ) : granularity === TimeFrames.QUARTER ? (
                    <>
                        <Stack spacing="xxs">
                            {labelWithHint('min_label')}
                            <FilterQuarterPicker
                                value={minDateValue}
                                maxDate={maxDateValue ?? undefined}
                                popoverProps={{
                                    shadow: 'sm',
                                    ...popoverProps,
                                }}
                                onChange={handleMinChange}
                            />
                        </Stack>
                        <Stack spacing="xxs">
                            {labelWithHint('max_label')}
                            <FilterQuarterPicker
                                disabled={
                                    !!filterRule.enableDynamicMaxAllowedDate
                                }
                                value={maxDateValue}
                                minDate={minDateValue ?? undefined}
                                popoverProps={{
                                    shadow: 'sm',
                                    ...popoverProps,
                                }}
                                onChange={handleMaxChange}
                            />
                        </Stack>
                    </>
                ) : (
                    <>
                        <FilterDatePicker
                            clearable
                            w={160}
                            label={labelWithHint('min_label')}
                            value={minDateValue}
                            maxDate={maxDateValue ?? undefined}
                            popoverProps={{
                                shadow: 'sm',
                                ...popoverProps,
                            }}
                            firstDayOfWeek={getFirstDayOfWeek(startOfWeek)}
                            onChange={handleMinChange}
                        />
                        <FilterDatePicker
                            clearable
                            w={160}
                            label={labelWithHint('max_label')}
                            value={maxDateValue}
                            minDate={minDateValue ?? undefined}
                            popoverProps={{
                                shadow: 'sm',
                                ...popoverProps,
                            }}
                            firstDayOfWeek={getFirstDayOfWeek(startOfWeek)}
                            onChange={handleMaxChange}
                        />
                    </>
                )}
            </Group>
            )}
        </Stack>
    );
};

export default DateRangeConstraintEditor;
