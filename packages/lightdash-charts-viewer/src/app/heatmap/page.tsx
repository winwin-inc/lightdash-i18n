'use client';

import {
    Alert,
    Box,
    Button,
    Card,
    Group,
    NumberInput,
    Select,
    Stack,
    Text,
    Title,
} from '@mantine/core';
import * as echarts from 'echarts';
import dynamic from 'next/dynamic';
import React, { useCallback, useEffect, useState } from 'react';

const ReactECharts = dynamic(() => import('echarts-for-react'), { ssr: false });

type HeatmapMode = 'topMap' | 'homeMap' | 'competitionMap';
type EntityType = 'group' | 'brand';

type FilterOptions = {
    bizDate: string[];
    cls2: string[];
    cls3: string[];
    cls4: string[];
    entityNames: string[];
};

const MODE_OPTIONS = [
    { value: 'topMap', label: '冠军地图' },
    { value: 'homeMap', label: '根据地地图' },
    { value: 'competitionMap', label: '竞争地图' },
] as const;

const ENTITY_OPTIONS = [
    { value: 'group', label: '集团' },
    { value: 'brand', label: '品牌' },
] as const;

const EMPTY_OPTIONS: FilterOptions = {
    bizDate: [],
    cls2: [],
    cls3: [],
    cls4: [],
    entityNames: [],
};

export default function HeatmapPage() {
    const [projectUuid, setProjectUuid] = useState<string | null>(null);
    const [entityType, setEntityType] = useState<EntityType>('group');
    const [mode, setMode] = useState<HeatmapMode>('topMap');
    const [filterOptions, setFilterOptions] =
        useState<FilterOptions>(EMPTY_OPTIONS);
    const [filterOptionsLoading, setFilterOptionsLoading] = useState(false);
    const [bizDate, setBizDate] = useState<string | null>(null);
    const [cls2, setCls2] = useState<string | null>(null);
    const [cls3, setCls3] = useState<string | null>(null);
    const [cls4, setCls4] = useState<string | null>(null);
    const [rn, setRn] = useState<number>(1);
    const [groupName, setGroupName] = useState('');
    const [groupNameA, setGroupNameA] = useState('');
    const [groupNameB, setGroupNameB] = useState('');
    const [brandName, setBrandName] = useState('');
    const [brandNameA, setBrandNameA] = useState('');
    const [brandNameB, setBrandNameB] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [echartsOption, setEchartsOption] = useState<Record<
        string,
        unknown
    > | null>(null);
    const [mapGeoJson, setMapGeoJson] = useState<unknown>(null);

    useEffect(() => {
        fetch('/api/config')
            .then((r) => r.json())
            .then((d: { projectUuid?: string; error?: string }) => {
                if (d.error) throw new Error(d.error);
                setProjectUuid(d.projectUuid ?? null);
            })
            .catch((e) => setError(e.message));
    }, []);

    useEffect(() => {
        if (!projectUuid?.trim()) {
            setFilterOptions(EMPTY_OPTIONS);
            return;
        }
        setFilterOptionsLoading(true);
        const params = new URLSearchParams({
            projectUuid: projectUuid.trim(),
            entityType,
        });
        fetch(`/api/heatmap/filter-options?${params}`)
            .then((r) => r.json())
            .then((d: FilterOptions | { error?: string }) => {
                if ((d as { error?: string }).error) {
                    throw new Error((d as { error: string }).error);
                }
                setFilterOptions({
                    bizDate: (d as FilterOptions).bizDate ?? [],
                    cls2: (d as FilterOptions).cls2 ?? [],
                    cls3: (d as FilterOptions).cls3 ?? [],
                    cls4: (d as FilterOptions).cls4 ?? [],
                    entityNames: (d as FilterOptions).entityNames ?? [],
                });
            })
            .catch(() => setFilterOptions(EMPTY_OPTIONS))
            .finally(() => setFilterOptionsLoading(false));
    }, [projectUuid, entityType]);

    const loadMapOnce = useCallback(async (): Promise<unknown> => {
        if (mapGeoJson) return mapGeoJson;
        const res = await fetch('/api/heatmap/map');
        if (!res.ok) {
            const d = await res.json().catch(() => ({}));
            throw new Error(
                (d as { error?: string }).error || 'Failed to load map',
            );
        }
        const geo = await res.json();
        echarts.registerMap(
            'china',
            geo as Parameters<typeof echarts.registerMap>[1],
        );
        setMapGeoJson(geo);
        return geo;
    }, [mapGeoJson]);

    const handleQuery = useCallback(async () => {
        if (!projectUuid) {
            setError('请先配置 projectUuid');
            return;
        }
        setError(null);
        setLoading(true);
        try {
            await loadMapOnce();
            const filters: Record<string, unknown> = {};
            if (bizDate?.trim()) filters.bizDate = bizDate.trim();
            if (cls2?.trim()) filters.cls2 = cls2.trim();
            if (cls3?.trim()) filters.cls3 = cls3.trim();
            if (cls4?.trim()) filters.cls4 = cls4.trim();
            if (mode === 'topMap') filters.rn = rn;
            if (entityType === 'group') {
                if (mode === 'homeMap' && groupName.trim())
                    filters.groupName = groupName.trim();
                if (
                    mode === 'competitionMap' &&
                    groupNameA.trim() &&
                    groupNameB.trim()
                ) {
                    filters.groupNames = [groupNameA.trim(), groupNameB.trim()];
                }
            } else {
                if (mode === 'homeMap' && brandName.trim())
                    filters.brandName = brandName.trim();
                if (
                    mode === 'competitionMap' &&
                    brandNameA.trim() &&
                    brandNameB.trim()
                ) {
                    filters.brandNames = [brandNameA.trim(), brandNameB.trim()];
                }
            }
            const res = await fetch('/api/heatmap/render', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    projectUuid,
                    mode,
                    entityType,
                    filters,
                }),
            });
            const data = await res.json();
            if (!res.ok) {
                throw new Error(
                    (data as { error?: string }).error || res.statusText,
                );
            }
            setEchartsOption(
                (data as { echartsOption: Record<string, unknown> })
                    .echartsOption,
            );
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Unknown error');
        } finally {
            setLoading(false);
        }
    }, [
        projectUuid,
        entityType,
        mode,
        bizDate,
        cls2,
        cls3,
        cls4,
        rn,
        groupName,
        groupNameA,
        groupNameB,
        brandName,
        brandNameA,
        brandNameB,
        loadMapOnce,
    ]);

    if (error && !projectUuid) {
        return (
            <Box p="xl">
                <Title order={1} mb="md">
                    省份热力图
                </Title>
                <Alert color="red" title="配置错误">
                    {error}
                </Alert>
                <Text size="sm" c="dimmed" mt="md">
                    请配置
                    .env.local：LIGHTDASH_SITE_URL、LIGHTDASH_API_KEY、LIGHTDASH_PROJECT_UUID
                </Text>
            </Box>
        );
    }

    return (
        <Box
            className="heatmap-page"
            p="xl"
            style={{
                minHeight: '100vh',
                display: 'flex',
                flexDirection: 'column',
                maxWidth: 1400,
                margin: '0 auto',
            }}
        >
            <Box
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: 12,
                    marginBottom: 20,
                }}
            >
                <Title order={3} fw={600} style={{ margin: 0 }}>
                    省份热力图 · {entityType === 'group' ? '集团' : '品牌'}
                </Title>
                <Button
                    component="a"
                    href="/"
                    variant="subtle"
                    size="xs"
                    color="gray"
                >
                    返回图表查看器
                </Button>
            </Box>

            <Card withBorder padding="md" radius="md" mb="md" shadow="sm">
                <Stack gap="md">
                    <Group wrap="wrap" align="flex-end" gap="sm">
                        <Select
                            label="实体类型"
                            data={ENTITY_OPTIONS.map((o) => ({
                                value: o.value,
                                label: o.label,
                            }))}
                            value={entityType}
                            onChange={(v) =>
                                setEntityType((v as EntityType) ?? 'group')
                            }
                            size="sm"
                            w={120}
                        />
                        <Select
                            label="模式"
                            data={MODE_OPTIONS.map((o) => ({
                                value: o.value,
                                label: o.label,
                            }))}
                            value={mode}
                            onChange={(v) =>
                                setMode((v as HeatmapMode) ?? 'topMap')
                            }
                            size="sm"
                            w={140}
                        />
                        <Select
                            label="月份"
                            placeholder="全部"
                            data={filterOptions.bizDate.map((v) => ({
                                value: v,
                                label: v,
                            }))}
                            value={bizDate ?? null}
                            onChange={setBizDate}
                            clearable
                            searchable
                            size="sm"
                            w={140}
                            disabled={filterOptionsLoading}
                        />
                        <Select
                            label="二级类目"
                            placeholder="全部"
                            data={filterOptions.cls2.map((v) => ({
                                value: v,
                                label: v,
                            }))}
                            value={cls2 ?? null}
                            onChange={setCls2}
                            clearable
                            searchable
                            size="sm"
                            w={160}
                            disabled={filterOptionsLoading}
                        />
                        <Select
                            label="三级类目"
                            placeholder="全部"
                            data={filterOptions.cls3.map((v) => ({
                                value: v,
                                label: v,
                            }))}
                            value={cls3 ?? null}
                            onChange={setCls3}
                            clearable
                            searchable
                            size="sm"
                            w={160}
                            disabled={filterOptionsLoading}
                        />
                        <Select
                            label="四级类目"
                            placeholder="全部"
                            data={filterOptions.cls4.map((v) => ({
                                value: v,
                                label: v,
                            }))}
                            value={cls4 ?? null}
                            onChange={setCls4}
                            clearable
                            searchable
                            size="sm"
                            w={160}
                            disabled={filterOptionsLoading}
                        />
                        {mode === 'topMap' && (
                            <NumberInput
                                label="排名"
                                description="冠军1 / 亚军2 / 季军3"
                                min={1}
                                max={3}
                                value={rn}
                                onChange={(v) => setRn(Number(v) ?? 1)}
                                size="sm"
                                w={120}
                            />
                        )}
                    </Group>
                    {(mode === 'homeMap' || mode === 'competitionMap') && (
                        <Group wrap="wrap" align="flex-end" gap="sm">
                            {mode === 'homeMap' &&
                                (entityType === 'group' ? (
                                    <Select
                                        label="集团名称"
                                        placeholder="请选择"
                                        data={filterOptions.entityNames.map(
                                            (v) => ({ value: v, label: v }),
                                        )}
                                        value={groupName || null}
                                        onChange={(v) => setGroupName(v ?? '')}
                                        searchable
                                        clearable
                                        size="sm"
                                        w={200}
                                        disabled={filterOptionsLoading}
                                    />
                                ) : (
                                    <Select
                                        label="品牌名称"
                                        placeholder="请选择"
                                        data={filterOptions.entityNames.map(
                                            (v) => ({ value: v, label: v }),
                                        )}
                                        value={brandName || null}
                                        onChange={(v) => setBrandName(v ?? '')}
                                        searchable
                                        clearable
                                        size="sm"
                                        w={200}
                                        disabled={filterOptionsLoading}
                                    />
                                ))}
                            {mode === 'competitionMap' &&
                                (entityType === 'group' ? (
                                    <>
                                        <Select
                                            label="集团 A"
                                            placeholder="请选择"
                                            data={filterOptions.entityNames.map(
                                                (v) => ({ value: v, label: v }),
                                            )}
                                            value={groupNameA || null}
                                            onChange={(v) =>
                                                setGroupNameA(v ?? '')
                                            }
                                            searchable
                                            clearable
                                            size="sm"
                                            w={180}
                                            disabled={filterOptionsLoading}
                                        />
                                        <Select
                                            label="集团 B"
                                            placeholder="请选择"
                                            data={filterOptions.entityNames.map(
                                                (v) => ({ value: v, label: v }),
                                            )}
                                            value={groupNameB || null}
                                            onChange={(v) =>
                                                setGroupNameB(v ?? '')
                                            }
                                            searchable
                                            clearable
                                            size="sm"
                                            w={180}
                                            disabled={filterOptionsLoading}
                                        />
                                    </>
                                ) : (
                                    <>
                                        <Select
                                            label="品牌 A"
                                            placeholder="请选择"
                                            data={filterOptions.entityNames.map(
                                                (v) => ({ value: v, label: v }),
                                            )}
                                            value={brandNameA || null}
                                            onChange={(v) =>
                                                setBrandNameA(v ?? '')
                                            }
                                            searchable
                                            clearable
                                            size="sm"
                                            w={180}
                                            disabled={filterOptionsLoading}
                                        />
                                        <Select
                                            label="品牌 B"
                                            placeholder="请选择"
                                            data={filterOptions.entityNames.map(
                                                (v) => ({ value: v, label: v }),
                                            )}
                                            value={brandNameB || null}
                                            onChange={(v) =>
                                                setBrandNameB(v ?? '')
                                            }
                                            searchable
                                            clearable
                                            size="sm"
                                            w={180}
                                            disabled={filterOptionsLoading}
                                        />
                                    </>
                                ))}
                        </Group>
                    )}
                    <Group gap="sm" align="flex-end">
                        <Button
                            onClick={handleQuery}
                            loading={loading}
                            disabled={loading}
                            size="sm"
                        >
                            {loading ? '查询中…' : '查询'}
                        </Button>
                        {error && (
                            <Alert
                                color="red"
                                title="错误"
                                style={{ flex: 1, maxWidth: 480 }}
                            >
                                {error}
                            </Alert>
                        )}
                    </Group>
                </Stack>
            </Card>

            {echartsOption && (
                <Card
                    withBorder
                    padding="md"
                    radius="md"
                    shadow="sm"
                    style={{ flex: 1, minHeight: 640 }}
                >
                    <Box
                        style={{
                            height: 'min(72vh, 800px)',
                            width: '100%',
                            minHeight: 560,
                        }}
                    >
                        <ReactECharts
                            option={echartsOption}
                            style={{ height: '100%', width: '100%' }}
                            notMerge
                            opts={{ renderer: 'canvas' }}
                        />
                    </Box>
                </Card>
            )}
        </Box>
    );
}
