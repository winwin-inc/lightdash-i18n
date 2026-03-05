'use client';

import {
    Alert,
    Box,
    Button,
    Card,
    Code,
    Collapse,
    List,
    Loader,
    ScrollArea,
    Stack,
    Text,
    Textarea,
    TextInput,
    Title,
    UnstyledButton,
} from '@mantine/core';
import { useClipboard } from '@mantine/hooks';
import React, { useCallback, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import type { ChartConfig, ResultRow } from '@/lib/echartsOption';
import { rowsToEChartsOption } from '@/lib/echartsOption';

const ReactECharts = dynamic(() => import('echarts-for-react'), { ssr: false });

type Config = { projectUuid: string };
type ExploreSummary = {
    name: string;
    label?: string;
    groupLabel?: string | null;
    type?: string;
}[];

function buildGroupedExplores(list: ExploreSummary) {
    const localeCompare = (a: string, b: string) =>
        (a || '').localeCompare(b || '', undefined, { sensitivity: 'base' });
    const withLabel = (e: (typeof list)[0]) => ({ ...e, label: e.label ?? e.name });
    const withLabels = list.map(withLabel);
    const grouped = new Map<string, (typeof list)[0][]>();
    const defaultUngrouped: (typeof list)[0][] = [];
    const virtual: (typeof list)[0][] = [];

    for (const e of withLabels) {
        if (e.type === 'virtual') virtual.push(e);
        else if (e.groupLabel) {
            const arr = grouped.get(e.groupLabel) ?? [];
            arr.push(e);
            grouped.set(e.groupLabel, arr);
        } else defaultUngrouped.push(e);
    }
    const groupNames = Array.from(grouped.keys()).sort(localeCompare);
    const groups: { label: string; explores: (typeof list)[0][] }[] = groupNames.map((name) => ({
        label: name,
        explores: (grouped.get(name) ?? []).sort((a, b) => localeCompare(a.label ?? '', b.label ?? '')),
    }));
    defaultUngrouped.sort((a, b) => localeCompare(a.label ?? '', b.label ?? ''));
    virtual.sort((a, b) => localeCompare(a.label ?? '', b.label ?? ''));
    return { groups, defaultUngrouped, virtual };
}

/** 与 API 返回的 explore 展示结构一致（中间层已处理好分组与排序） */
type ExploreDetail = {
    name: string;
    baseTable: string;
    dimensionsForDisplay: import('@/lib/exploreDisplay').DimensionDisplayItem[];
    metrics: import('@/lib/exploreDisplay').FieldOption[];
    defaultChartFields: { xField: string; yField: string; xLabel: string; yLabel: string } | null;
};

type FieldOption = { id: string; label: string };

/** 单行字段（可复用于 List 内或 Stack 内，带缩进时用此组件保证层级清晰） */
function FieldListRow({
    item,
    copiedId,
    onCopy,
}: {
    item: FieldOption;
    copiedId: string | null;
    onCopy: (id: string) => void;
}) {
    const isCopied = copiedId === item.id;
    return (
        <UnstyledButton
            onClick={() => onCopy(item.id)}
            style={{ display: 'block', textAlign: 'left', width: '100%', padding: '4px 8px', borderRadius: 4 }}
            className="field-list-item"
        >
            <Text size="sm" span={false}>
                {item.label}
                {isCopied && (
                    <Text size="xs" c="dimmed" ml={6} span>
                        已复制
                    </Text>
                )}
            </Text>
        </UnstyledButton>
    );
}

function FieldListItem({
    item,
    copiedId,
    onCopy,
}: {
    item: FieldOption;
    copiedId: string | null;
    onCopy: (id: string) => void;
}) {
    return (
        <List.Item>
            <FieldListRow item={item} copiedId={copiedId} onCopy={onCopy} />
        </List.Item>
    );
}

export default function ChartsViewerPage() {
    const [config, setConfig] = useState<Config | null>(null);
    const [explores, setExplores] = useState<ExploreSummary>([]);
    const [exploreId, setExploreId] = useState<string>('');
    const [exploreDetail, setExploreDetail] = useState<ExploreDetail | null>(null);
    const [dimensionGroupOpen, setDimensionGroupOpen] = useState<Record<string, boolean>>({});
    const [rows, setRows] = useState<ResultRow[]>([]);
    const [columns, setColumns] = useState<unknown>(null);
    const [chartConfigJson, setChartConfigJson] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [loading, setLoading] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [lastRequestBody, setLastRequestBody] = useState<string>('');
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const { copy } = useClipboard();

    const filteredExplores = React.useMemo(() => {
        if (!searchQuery.trim()) return explores;
        const q = searchQuery.trim().toLowerCase();
        return explores.filter(
            (e) =>
                (e.label ?? e.name).toLowerCase().includes(q) ||
                e.name.toLowerCase().includes(q),
        );
    }, [explores, searchQuery]);

    const { groups, defaultUngrouped, virtual } = React.useMemo(
        () => buildGroupedExplores(filteredExplores),
        [filteredExplores],
    );

    useEffect(() => {
        fetch('/api/config')
            .then((r) => r.json())
            .then((d) => {
                if (d.error) throw new Error(d.error);
                setConfig(d);
                return d.projectUuid;
            })
            .then((projectUuid) =>
                fetch(`/api/explores?projectUuid=${encodeURIComponent(projectUuid)}`),
            )
            .then((r) => r.json())
            .then((d) => {
                if (d.error) throw new Error(d.error);
                const list = Array.isArray(d) ? d : d.tables ?? d.results ?? [];
                setExplores(
                    list.map(
                        (t: {
                            name: string;
                            label?: string;
                            groupLabel?: string | null;
                            type?: string;
                        }) => ({
                            name: t.name,
                            label: t.label ?? t.name,
                            groupLabel: t.groupLabel ?? null,
                            type: t.type,
                        }),
                    ),
                );
            })
            .catch((e) => setError(e.message));
    }, []);

    const loadExplore = useCallback(() => {
        if (!config?.projectUuid || !exploreId) return;
        setLoading('explore');
        setError(null);
        setExploreDetail(null);
        fetch(
            `/api/explores/${encodeURIComponent(exploreId)}?projectUuid=${encodeURIComponent(config.projectUuid)}`,
        )
            .then((r) => r.json())
            .then((d: ExploreDetail & { error?: string }) => {
                if (d.error) throw new Error(d.error);
                setExploreDetail(d);
                if (d.defaultChartFields) {
                    setChartConfigJson(
                        JSON.stringify(
                            {
                                chartType: 'bar',
                                xField: d.defaultChartFields.xField,
                                yField: d.defaultChartFields.yField,
                                xLabel: d.defaultChartFields.xLabel,
                                yLabel: d.defaultChartFields.yLabel,
                                tooltip: true,
                            },
                            null,
                            2,
                        ),
                    );
                }
            })
            .catch((e) => setError(e.message))
            .finally(() => setLoading(''));
    }, [config?.projectUuid, exploreId]);

    useEffect(() => {
        if (config?.projectUuid && exploreId) loadExplore();
    }, [config?.projectUuid, exploreId, loadExplore]);

    const handleTableChange = useCallback((value: string | null) => {
        setExploreId(value ?? '');
        setRows([]);
        setChartConfigJson('');
        setError(null);
    }, []);

    const handleCopyField = useCallback((fieldId: string) => {
        copy(fieldId);
        setCopiedId(fieldId);
        window.setTimeout(() => setCopiedId(null), 2000);
    }, [copy]);

    const parsedConfig = React.useMemo(() => {
        if (!chartConfigJson.trim())
            return { config: null as ChartConfig | null, parseError: null as string | null };
        try {
            const c = JSON.parse(chartConfigJson) as ChartConfig;
            return { config: c, parseError: null };
        } catch (e) {
            return {
                config: null,
                parseError: e instanceof Error ? e.message : 'Invalid JSON',
            };
        }
    }, [chartConfigJson]);

    const runQuery = useCallback(() => {
        if (!config?.projectUuid || !exploreDetail?.name) return;
        let cfg: ChartConfig;
        try {
            cfg = JSON.parse(chartConfigJson) as ChartConfig;
        } catch {
            setError('配置 JSON 无效');
            return;
        }
        const { xField: xF, yField: yF } = cfg;
        if (!xF || !yF) {
            setError('配置中需包含 xField 和 yField');
            return;
        }
        setLoading('query');
        setError(null);
        const requestBody = {
            projectUuid: config.projectUuid,
            query: {
                exploreName: exploreDetail.name,
                dimensions: [xF],
                metrics: [yF],
                filters: {},
                sorts: [],
                limit: 500,
                tableCalculations: [],
            },
        };
        setLastRequestBody(JSON.stringify(requestBody, null, 2));
        fetch('/api/query/run', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody),
        })
            .then((r) => r.json())
            .then((d) => {
                if (d.error) throw new Error(d.error);
                setRows((d.rows ?? []) as ResultRow[]);
                setColumns(d.columns ?? null);
            })
            .catch((e) => setError(e.message))
            .finally(() => setLoading(''));
    }, [config?.projectUuid, exploreDetail?.name, chartConfigJson]);

    const echartsOption =
        parsedConfig.config && rows.length > 0
            ? rowsToEChartsOption(rows, parsedConfig.config)
            : null;

    if (error && !config) {
        return (
            <Box p="xl">
                <Title order={1} mb="md">图表查看器</Title>
                <Alert color="red" title="配置错误">{error}</Alert>
                <Text size="sm" c="dimmed" mt="md">
                    请配置 .env.local：LIGHTDASH_SITE_URL、LIGHTDASH_API_KEY、LIGHTDASH_PROJECT_UUID
                </Text>
            </Box>
        );
    }

    return (
        <Box p="xl" style={{ height: '100vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <Title order={1} mb="lg" style={{ flexShrink: 0 }}>图表查看器</Title>

            <Box style={{ display: 'flex', gap: 24, flex: 1, minHeight: 0, overflow: 'hidden', alignItems: 'stretch' }}>
                <Stack gap="md" w={400} style={{ flexShrink: 0, minHeight: 0, overflow: 'hidden' }} miw={400}>
                    <Card withBorder padding="md" radius="md" style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                        <Text size="sm" fw={600} mb="xs">表（explore）</Text>
                        <TextInput
                            placeholder="搜索表"
                            value={searchQuery}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.currentTarget.value)}
                            size="sm"
                            mb="sm"
                        />
                        <ScrollArea style={{ flex: 1, minHeight: 0 }} viewportProps={{ style: { minHeight: 0 } }}>
                            <Stack gap={4}>
                                {groups.map((g) => (
                                    <Box key={g.label}>
                                        <Text size="xs" c="dimmed" fw={600} mb={4}>{g.label}</Text>
                                        {g.explores.map((e) => (
                                            <UnstyledButton
                                                key={e.name}
                                                onClick={() => handleTableChange(e.name)}
                                                style={{
                                                    display: 'block',
                                                    width: '100%',
                                                    padding: '8px 10px',
                                                    borderRadius: 6,
                                                    textAlign: 'left',
                                                    background: exploreId === e.name ? 'var(--mantine-color-blue-light)' : undefined,
                                                }}
                                            >
                                                <Text size="sm">{e.label ?? e.name}</Text>
                                            </UnstyledButton>
                                        ))}
                                    </Box>
                                ))}
                                {defaultUngrouped.length > 0 && (
                                    <Box>
                                        <Text size="xs" c="dimmed" fw={600} mb={4}>未分组</Text>
                                        {defaultUngrouped.map((e) => (
                                            <UnstyledButton
                                                key={e.name}
                                                onClick={() => handleTableChange(e.name)}
                                                style={{
                                                    display: 'block',
                                                    width: '100%',
                                                    padding: '8px 10px',
                                                    borderRadius: 6,
                                                    textAlign: 'left',
                                                    background: exploreId === e.name ? 'var(--mantine-color-blue-light)' : undefined,
                                                }}
                                            >
                                                <Text size="sm">{e.label ?? e.name}</Text>
                                            </UnstyledButton>
                                        ))}
                                    </Box>
                                )}
                                {virtual.length > 0 && (
                                    <Box>
                                        <Text size="xs" c="dimmed" fw={600} mb={4}>Virtual views</Text>
                                        {virtual.map((e) => (
                                            <UnstyledButton
                                                key={e.name}
                                                onClick={() => handleTableChange(e.name)}
                                                style={{
                                                    display: 'block',
                                                    width: '100%',
                                                    padding: '8px 10px',
                                                    borderRadius: 6,
                                                    textAlign: 'left',
                                                    background: exploreId === e.name ? 'var(--mantine-color-blue-light)' : undefined,
                                                }}
                                            >
                                                <Text size="sm">{e.label ?? e.name}</Text>
                                            </UnstyledButton>
                                        ))}
                                    </Box>
                                )}
                            </Stack>
                        </ScrollArea>
                        {loading === 'explore' && (
                            <Box mt="xs" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <Loader size="xs" />
                                <Text size="xs" c="dimmed">加载字段中…</Text>
                            </Box>
                        )}
                    </Card>

                    {exploreDetail && (
                        <Card withBorder padding="md" radius="md" style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                            <Text size="sm" fw={600} mb="xs">当前表的维度和指标</Text>
                            <Text size="xs" c="dimmed" mb="xs">点击可复制字段 id 到剪贴板</Text>
                            <ScrollArea style={{ flex: 1, minHeight: 0 }} viewportProps={{ style: { minHeight: 0 } }}>
                                <Text size="xs" fw={600} mb={4}>维度</Text>
                                <Stack gap={0}>
                                    {exploreDetail.dimensionsForDisplay.map((entry) =>
                                        entry.kind === 'group' ? (
                                            <Box key={`group-${entry.groupLabel}`} mb={4}>
                                                <UnstyledButton
                                                    onClick={() => setDimensionGroupOpen((o) => ({ ...o, [entry.groupLabel]: !o[entry.groupLabel] }))}
                                                    style={{ display: 'block', width: '100%', textAlign: 'left', padding: '2px 8px', borderRadius: 4 }}
                                                >
                                                    <Text size="xs" fw={500} c="blue" style={{ textDecoration: 'underline' }}>
                                                        {entry.groupLabel}
                                                    </Text>
                                                </UnstyledButton>
                                                <Collapse in={dimensionGroupOpen[entry.groupLabel] !== false}>
                                                    <Stack gap={0} pl={24}>
                                                        {entry.children.map((c) => (
                                                            <FieldListRow
                                                                key={c.id}
                                                                item={c}
                                                                copiedId={copiedId}
                                                                onCopy={handleCopyField}
                                                            />
                                                        ))}
                                                    </Stack>
                                                </Collapse>
                                            </Box>
                                        ) : (
                                            <FieldListRow
                                                key={entry.item.id}
                                                item={entry.item}
                                                copiedId={copiedId}
                                                onCopy={handleCopyField}
                                            />
                                        ),
                                    )}
                                </Stack>
                                <Text size="xs" fw={600} mb={4} mt="sm">指标</Text>
                                <List size="sm" spacing={0} listStyleType="none" style={{ paddingLeft: 0 }}>
                                    {exploreDetail.metrics.map((m) => (
                                        <FieldListItem
                                            key={m.id}
                                            item={m}
                                            copiedId={copiedId}
                                            onCopy={handleCopyField}
                                        />
                                    ))}
                                </List>
                            </ScrollArea>
                        </Card>
                    )}
                </Stack>

                <Stack gap="md" style={{ flex: 1, minWidth: 0, minHeight: 0, overflow: 'auto' }}>
                    {exploreDetail && (
                        <>
                            <Card withBorder padding="md" radius="md">
                                <Text size="sm" fw={600} mb="xs">图表配置 JSON</Text>
                                <Textarea
                                    value={chartConfigJson}
                                    onChange={(e) => setChartConfigJson(e.target.value)}
                                    placeholder='{"chartType":"bar","xField":"...","yField":"...","xLabel":"...","yLabel":"...","tooltip":true}'
                                    minRows={22}
                                    autosize
                                    maxRows={40}
                                    styles={{ input: { fontFamily: 'monospace' } }}
                                />
                                {parsedConfig.parseError && (
                                    <Alert color="red" mt="xs" title="配置无效">
                                        {parsedConfig.parseError}
                                    </Alert>
                                )}
                            </Card>
                            <Box style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                                <Button
                                    onClick={runQuery}
                                    loading={loading === 'query'}
                                    disabled={!!parsedConfig.parseError}
                                >
                                    {loading === 'query' ? '查询中…' : '运行查询'}
                                </Button>
                                {error && (
                                    <Alert color="red" style={{ flex: 1 }} title="请求错误">
                                        {error.includes('500') ? (
                                            <>
                                                <Text size="sm">Lightdash 服务端异常，请稍后重试或检查实例状态。</Text>
                                                <Text size="xs" mt="xs">若在 Lightdash 界面中执行相同查询可成功，请检查 API Key 是否具备该项目的查询权限。</Text>
                                                {(() => {
                                                    const match = error.match(/"sentryEventId"\s*:\s*"([^"]+)"/);
                                                    const eventId = match ? match[1] : null;
                                                    return eventId ? (
                                                        <Text size="xs" mt="xs">请将以下事件 ID 提供给 Lightdash 管理员在 Sentry 中排查：<Code>{eventId}</Code></Text>
                                                    ) : null;
                                                })()}
                                                {lastRequestBody && (
                                                    <Button
                                                        size="xs"
                                                        variant="light"
                                                        mt="xs"
                                                        onClick={() => { copy(lastRequestBody); }}
                                                    >
                                                        复制本次请求体（供管理员调试）
                                                    </Button>
                                                )}
                                                <Text size="xs" c="dimmed" mt="xs" component="pre" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: 80, overflow: 'auto' }}>
                                                    {error}
                                                </Text>
                                            </>
                                        ) : (
                                            <Text size="sm">{error}</Text>
                                        )}
                                    </Alert>
                                )}
                            </Box>
                        </>
                    )}

                    {echartsOption && (
                        <Card withBorder padding="md" radius="md">
                            <Text size="sm" fw={600} mb="xs">图表</Text>
                            <Box h={400}>
                                <ReactECharts
                                    option={echartsOption}
                                    style={{ height: '100%', width: '100%' }}
                                    notMerge
                                />
                            </Box>
                        </Card>
                    )}
                    {exploreDetail && !echartsOption && rows.length === 0 && !parsedConfig.parseError && (
                        <Text size="sm" c="dimmed">编辑配置 JSON 后点击「运行查询」查看图表。</Text>
                    )}
                </Stack>
            </Box>
        </Box>
    );
}
