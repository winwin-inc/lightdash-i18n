import {
    getItemMap,
    isCustomDimension,
    isDimension,
    isMetric,
    isTableCalculation,
    type ApiErrorDetail,
    type Explore,
    type ItemsMap,
    type MetricQuery,
} from '@lightdash/common';
import {
    Badge,
    Button,
    Collapse,
    Group,
    Stack,
    Text,
    UnstyledButton,
} from '@mantine/core';
import { useMemo, useState, type FC } from 'react';
import { useTranslation } from 'react-i18next';

import {
    getChartErrorDiagnosis,
    type ChartErrorDiagnosis,
} from '../../../utils/chartErrorDiagnosis';

type FieldGroup = 'dimension' | 'metric' | 'tableCalculation' | 'unknown';

type ChartErrorDetailsProps = {
    error: ApiErrorDetail;
    metricQuery: MetricQuery | undefined;
    explore: Explore | null;
    /** 调用方传已翻译的图表类型名（如「表格」） */
    chartTypeLabel?: string;
    /** tile 内 2 行模式：摘要一行 + 查看详情按钮 */
    compact?: boolean;
    /** compact 模式下由外部打开 Modal */
    onViewDetails?: () => void;
};

const GROUP_LABEL_KEYS: Record<Exclude<FieldGroup, 'unknown'>, string> = {
    dimension: 'components_chart_error_details.group_dimension',
    metric: 'components_chart_error_details.group_metric',
    tableCalculation: 'components_chart_error_details.group_table_calculation',
};

const ORIGIN_LABEL_KEYS: Record<
    ChartErrorDiagnosis['invalid'][number]['origin'],
    string
> = {
    query: 'components_chart_error_details.origin_query',
    filter: 'components_chart_error_details.origin_filter',
    sort: 'components_chart_error_details.origin_sort',
    dashboardFilter: 'components_chart_error_details.origin_dashboard_filter',
    dashboardSort: 'components_chart_error_details.origin_dashboard_sort',
    dateZoom: 'components_chart_error_details.origin_date_zoom',
};

const KIND_SENTENCE_KEYS: Record<
    'permission' | 'notFound' | 'parameter',
    string
> = {
    permission: 'components_chart_error_details.permission',
    notFound: 'components_chart_error_details.not_found',
    parameter: 'components_chart_error_details.parameter',
};

/** 门控 kind 对应的一句话说明；非门控 kind 返回 null */
const getGatedSentenceKey = (
    kind: ChartErrorDiagnosis['kind'],
): string | null => {
    switch (kind) {
        case 'permission':
            return KIND_SENTENCE_KEYS.permission;
        case 'notFound':
            return KIND_SENTENCE_KEYS.notFound;
        case 'parameter':
            return KIND_SENTENCE_KEYS.parameter;
        default:
            return null;
    }
};

/** 每组默认最多展示的字段条数，超出折叠为「还有 N 个」 */
const MAX_ITEMS_PER_GROUP = 5;
/** 摘要句中最多点名的失效字段个数 */
const MAX_SUMMARY_LABELS = 3;

/**
 * 图表错误详情面板（纯展示组件）。
 *
 * 存在性判定只来自 utils/chartErrorDiagnosis（explore 判定），本组件拿
 * explore 派生的 itemsMap 仅为展示 label / 分组，绝不参与「字段是否失效」的判断
 * （见 docs/visualization/chart-error-diagnostics-plan.md 第 4 节硬性禁止）。
 */
const ChartErrorDetails: FC<ChartErrorDetailsProps> = ({
    error,
    metricQuery,
    explore,
    chartTypeLabel,
    compact = false,
    onViewDetails,
}) => {
    const { t, i18n } = useTranslation();
    const [isTechDetailsOpen, setIsTechDetailsOpen] = useState(false);

    const isZh = (i18n.language ?? 'en').toLowerCase().startsWith('zh');
    const summaryColon = isZh ? '：' : ': ';
    const labelSeparator = isZh ? '、' : ', ';

    const diagnosis = useMemo<ChartErrorDiagnosis | null>(() => {
        if (!metricQuery) return null;
        return getChartErrorDiagnosis({ error, metricQuery, explore });
    }, [error, metricQuery, explore]);

    /** 仅用于 label / 分组展示（来自 explore，非查询结果字段） */
    const itemsMap = useMemo<ItemsMap | undefined>(() => {
        if (!explore) return undefined;
        return getItemMap(
            explore,
            metricQuery?.additionalMetrics ?? [],
            metricQuery?.tableCalculations ?? [],
            metricQuery?.customDimensions ?? [],
        );
    }, [explore, metricQuery]);

    const getFieldLabel = (
        fieldId: string,
        diagnosisLabel?: string | null,
    ): string => {
        if (diagnosisLabel) return diagnosisLabel;
        const item = itemsMap?.[fieldId];
        if (!item) return fieldId;
        if (isTableCalculation(item)) return item.displayName || fieldId;
        if (isCustomDimension(item)) return item.name;
        return 'label' in item && item.label ? item.label : fieldId;
    };

    const classifyField = (fieldId: string): FieldGroup => {
        const item = itemsMap?.[fieldId];
        if (!item) return 'unknown';
        if (isTableCalculation(item)) return 'tableCalculation';
        if (isDimension(item) || isCustomDimension(item)) return 'dimension';
        if (isMetric(item)) return 'metric';
        return 'unknown';
    };

    const summary = useMemo<string | null>(() => {
        if (!diagnosis) return error.message || null;
        const gatedKey = getGatedSentenceKey(diagnosis.kind);
        if (gatedKey) return t(gatedKey);
        if (diagnosis.confident && diagnosis.invalid.length > 0) {
            const countKey =
                diagnosis.invalid.length === 1
                    ? 'components_chart_error_details.summary_invalid_one'
                    : 'components_chart_error_details.summary_invalid_other';
            const labels = diagnosis.invalid
                .slice(0, MAX_SUMMARY_LABELS)
                .map((field) => getFieldLabel(field.fieldId, field.label))
                .join(labelSeparator);
            return `${t(countKey, {
                count: diagnosis.invalid.length,
            })}${summaryColon}${labels}`;
        }
        if (diagnosis.confident && diagnosis.invalid.length === 0) {
            return t('components_chart_error_details.summary_none');
        }
        // 门控 kind（含 warehouse/unknown）declaredFieldIds 为空，降级为 summary_none
        if (diagnosis.declaredFieldIds.length === 0) {
            return t('components_chart_error_details.summary_none');
        }
        return t('components_chart_error_details.summary_uncertain', {
            count: diagnosis.declaredFieldIds.length,
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [diagnosis, itemsMap, labelSeparator, summaryColon, t]);

    /** 分组后的字段清单：invalid 排最前；unknown 组不渲染组名 */
    const fieldGroups = useMemo<
        {
            group: FieldGroup;
            fields: {
                fieldId: string;
                label: string;
                isInvalid: boolean;
                origin?: ChartErrorDiagnosis['invalid'][number]['origin'];
            }[];
        }[]
    >(() => {
        if (!diagnosis || getGatedSentenceKey(diagnosis.kind)) return [];
        const invalidByFieldId = new Map(
            diagnosis.invalid.map((field) => [field.fieldId, field]),
        );

        const buckets: Record<FieldGroup, string[]> = {
            dimension: [],
            metric: [],
            tableCalculation: [],
            unknown: [],
        };
        for (const fieldId of diagnosis.declaredFieldIds) {
            const group = classifyField(fieldId);
            if (!buckets[group].includes(fieldId)) buckets[group].push(fieldId);
        }
        // 防御：invalid 字段理论上都在 declared 里，缺失时补到其诊断分组
        for (const field of diagnosis.invalid) {
            const bucket =
                field.group === 'unknown'
                    ? buckets.unknown
                    : buckets[field.group];
            if (!bucket.includes(field.fieldId)) bucket.push(field.fieldId);
        }

        return (Object.entries(buckets) as [FieldGroup, string[]][])
            .filter(([, fields]) => fields.length > 0)
            .map(([group, fields]) => ({
                group,
                fields: fields
                    .map((fieldId) => {
                        const invalidField = invalidByFieldId.get(fieldId);
                        return {
                            fieldId,
                            label: getFieldLabel(
                                fieldId,
                                invalidField?.label ?? null,
                            ),
                            isInvalid: invalidField !== undefined,
                            origin: invalidField?.origin,
                        };
                    })
                    .sort((a, b) => Number(b.isInvalid) - Number(a.isInvalid)),
            }));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [diagnosis, itemsMap]);

    if (compact) {
        return (
            <Stack align="center" spacing="xs" w="100%">
                <Text align="center" color="dimmed" lineClamp={2} size="xs">
                    {summary ?? error.message}
                </Text>
                <Button
                    compact
                    onClick={onViewDetails}
                    size="xs"
                    variant="light"
                >
                    {t('components_chart_error_details.view_details')}
                </Button>
            </Stack>
        );
    }

    return (
        <Stack maw={480} spacing="xs" w="100%">
            {summary ? (
                <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
                    {summary}
                </Text>
            ) : null}

            {chartTypeLabel ? (
                <Text size="xs" color="dimmed">
                    {t('components_chart_error_details.chart_type_label', {
                        type: chartTypeLabel,
                    })}
                </Text>
            ) : null}

            {fieldGroups.map(({ group, fields }) => (
                <Stack key={group} spacing={4}>
                    {group !== 'unknown' ? (
                        <Text fw={600} size="xs" color="dimmed">
                            {t(GROUP_LABEL_KEYS[group])}
                        </Text>
                    ) : null}
                    {fields.slice(0, MAX_ITEMS_PER_GROUP).map((field) => (
                        <Group key={field.fieldId} spacing={4} w="100%">
                            {field.isInvalid ? (
                                <Badge color="red" size="xs" variant="light">
                                    {t(
                                        'components_chart_error_details.invalid_badge',
                                    )}
                                </Badge>
                            ) : null}
                            {field.isInvalid && field.origin ? (
                                <Badge color="gray" size="xs" variant="outline">
                                    {t(ORIGIN_LABEL_KEYS[field.origin])}
                                </Badge>
                            ) : null}
                            <Text
                                color={field.isInvalid ? 'red.6' : undefined}
                                size="xs"
                                style={{
                                    flex: '1 1 auto',
                                    minWidth: 0,
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                }}
                                title={field.label}
                            >
                                {field.label}
                            </Text>
                        </Group>
                    ))}
                    {fields.length > MAX_ITEMS_PER_GROUP ? (
                        <Text size="xs" color="dimmed">
                            {t('components_chart_error_details.more_in_group', {
                                count: fields.length - MAX_ITEMS_PER_GROUP,
                            })}
                        </Text>
                    ) : null}
                </Stack>
            ))}

            <div>
                <UnstyledButton
                    onClick={() => setIsTechDetailsOpen((isOpen) => !isOpen)}
                >
                    <Text
                        color="dimmed"
                        size="xs"
                        span
                        style={{ textDecoration: 'underline' }}
                    >
                        {t('components_chart_error_details.technical_details')}
                    </Text>
                </UnstyledButton>
                <Collapse in={isTechDetailsOpen}>
                    <Text
                        color="dimmed"
                        mt="xxs"
                        size="xs"
                        style={{
                            fontFamily: 'monospace',
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word',
                        }}
                    >
                        {error.message || ''}
                    </Text>
                </Collapse>
            </div>

            <Text size="xs" color="dimmed">
                {t('components_chart_error_details.note_query_fields_only')}
            </Text>
        </Stack>
    );
};

export default ChartErrorDetails;
