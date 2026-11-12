import {
    FilterOperator,
    type DashboardFilterRule,
    type DashboardFilters,
} from '@lightdash/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { lightdashApi } from '../api';
import {
    buildCategoryChain,
    clearFieldSearchCacheForTests,
    createCategoryRequestSession,
    initializeCategoryFiltersAsync,
    probeFilterCandidateAvailabilityAsync,
    updateCategoryFilterCascadeAsync,
    updateCrossScopeCategoryCascadeAsync,
} from './categoryFilters';

vi.mock('../api', () => ({ lightdashApi: vi.fn() }));

const api = vi.mocked(lightdashApi);

const projectUuid = 'project-1';
const dashboardContext = {
    dashboardSlug: 'dash-slug',
    dashboardName: 'Dash Name',
};

const TAB_UUID = 'tab-1';

/** 四级类目（父级），值由参数控制 */
const categoryRule = (values?: string[]): DashboardFilterRule => ({
    id: 'l4',
    target: { fieldId: 'insight_list_cls_4', tableName: 'insight_list' },
    operator: FilterOperator.EQUALS,
    values,
    label: undefined,
    categoryLevel: 4,
});

/**
 * 「任何值」+ 开启「无值隐藏关联图表」的普通维度（候选探测目标）
 */
const probeRule = (
    overrides: Partial<DashboardFilterRule> & { id?: string } = {},
): DashboardFilterRule => ({
    id: overrides.id ?? 'probe',
    target: {
        fieldId: overrides.target?.fieldId ?? 'insight_list_group',
        tableName: 'insight_list',
        isSqlColumn: overrides.target?.isSqlColumn,
    },
    operator: overrides.operator ?? FilterOperator.EQUALS,
    values: overrides.values,
    label: undefined,
    hideTilesWhenEmpty: overrides.hideTilesWhenEmpty ?? true,
    disabled: overrides.disabled ?? true,
    parentFieldId: overrides.parentFieldId ?? 'insight_list_cls_4',
    parentScope: overrides.parentScope ?? 'tab',
    parentTabUuid: overrides.parentTabUuid ?? TAB_UUID,
});

const asFilters = (dimensions: DashboardFilterRule[]): DashboardFilters => ({
    dimensions,
    metrics: [],
    tableCalculations: [],
});

const mockSearchResults = (results: string[]) => {
    api.mockResolvedValueOnce({
        search: '',
        results,
        cached: false,
        refreshedAt: new Date(),
    } as never);
};

const tabChain = (rules: DashboardFilterRule[]) =>
    buildCategoryChain(
        {
            globalFilters: asFilters([]),
            tabFilters: { [TAB_UUID]: asFilters(rules) },
        },
        TAB_UUID,
    );

describe('probeFilterCandidateAvailabilityAsync（候选探测）', () => {
    beforeEach(() => {
        api.mockReset();
        clearFieldSearchCacheForTests();
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'debug').mockImplementation(() => {});
        vi.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
        clearFieldSearchCacheForTests();
    });

    it('有候选值 → has，且探测请求带上父级条件', async () => {
        mockSearchResults(['海天', '李锦记']);

        const status = await probeFilterCandidateAvailabilityAsync({
            filter: probeRule(),
            chain: tabChain([categoryRule(['醋']), probeRule()]),
            projectUuid,
            dashboardContext,
        });

        expect(status).toBe('has');
        expect(api).toHaveBeenCalledTimes(1);
        const body = JSON.stringify(api.mock.calls[0]?.[0]);
        expect(body).toContain('insight_list_cls_4');
        expect(body).toContain('醋');
    });

    it('候选为空 → none', async () => {
        mockSearchResults([]);

        const status = await probeFilterCandidateAvailabilityAsync({
            filter: probeRule(),
            chain: tabChain([categoryRule(['醋']), probeRule()]),
            projectUuid,
            dashboardContext,
        });

        expect(status).toBe('none');
        expect(api).toHaveBeenCalledTimes(1);
    });

    it('父链断裂（父级无值）→ none，不发请求', async () => {
        const status = await probeFilterCandidateAvailabilityAsync({
            filter: probeRule(),
            chain: tabChain([categoryRule([]), probeRule()]),
            projectUuid,
            dashboardContext,
        });

        expect(status).toBe('none');
        expect(api).not.toHaveBeenCalled();
    });

    it('未绑定父级的「任何值」筛选器：无左链时按无条件查询探测', async () => {
        const plainRule: DashboardFilterRule = {
            id: 'probe-plain',
            target: {
                fieldId: 'insight_list_status',
                tableName: 'insight_list',
            },
            operator: FilterOperator.EQUALS,
            values: undefined,
            label: undefined,
            hideTilesWhenEmpty: true,
            disabled: true,
        };
        mockSearchResults(['在售', '下架']);

        const status = await probeFilterCandidateAvailabilityAsync({
            filter: plainRule,
            chain: tabChain([plainRule]),
            projectUuid,
            dashboardContext,
        });

        expect(status).toBe('has');
        expect(api).toHaveBeenCalledTimes(1);
    });

    it('请求失败 → unknown', async () => {
        api.mockRejectedValueOnce(new Error('warehouse down'));

        const status = await probeFilterCandidateAvailabilityAsync({
            filter: probeRule(),
            chain: tabChain([categoryRule(['醋']), probeRule()]),
            projectUuid,
            dashboardContext,
        });

        expect(status).toBe('unknown');
    });

    describe('不适用时不发请求（needsCandidateProbe 为 false）', () => {
        const expectNotProbed = async (
            filter: DashboardFilterRule,
        ): Promise<void> => {
            const status = await probeFilterCandidateAvailabilityAsync({
                filter,
                chain: tabChain([categoryRule(['醋']), filter]),
                projectUuid,
                dashboardContext,
            });
            expect(status).toBe('unknown');
            expect(api).not.toHaveBeenCalled();
        };

        it('未开启 hideTilesWhenEmpty', async () => {
            await expectNotProbed(probeRule({ hideTilesWhenEmpty: false }));
        });

        it('非「任何值」（disabled = false）', async () => {
            await expectNotProbed(
                probeRule({ disabled: false, values: ['海天'] }),
            );
        });

        it('SQL 列', async () => {
            await expectNotProbed(
                probeRule({
                    target: {
                        fieldId: 'insight_list_group',
                        tableName: 'insight_list',
                        isSqlColumn: true,
                    },
                }),
            );
        });

        it('值型算子（NOT_NULL / IN_THE_CURRENT）', async () => {
            await expectNotProbed(
                probeRule({ operator: FilterOperator.NOT_NULL }),
            );
            await expectNotProbed(
                probeRule({ operator: FilterOperator.IN_THE_CURRENT }),
            );
        });

        it('类目筛选器', async () => {
            await expectNotProbed({
                ...categoryRule([]),
                hideTilesWhenEmpty: true,
                disabled: true,
            });
        });
    });

    it('只探测，绝不写 values / disabled', async () => {
        mockSearchResults([]);
        const filters = asFilters([categoryRule(['醋']), probeRule()]);
        const onCandidateAvailability = vi.fn();

        const refined = await initializeCategoryFiltersAsync(
            filters,
            projectUuid,
            dashboardContext,
            {
                scope: {
                    location: { scope: 'tab', tabUuid: TAB_UUID },
                    chain: tabChain([categoryRule(['醋']), probeRule()]),
                },
                skipFilterIds: ['l4'],
                onCandidateAvailability,
            },
        );

        expect(refined).toEqual(filters);
        expect(refined.dimensions[1].values).toBeUndefined();
        expect(refined.dimensions[1].disabled).toBe(true);
        expect(api).toHaveBeenCalledTimes(1);
    });
});

describe('入口解析结束后的候选可用性上报', () => {
    beforeEach(() => {
        api.mockReset();
        clearFieldSearchCacheForTests();
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'debug').mockImplementation(() => {});
        vi.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
        clearFieldSearchCacheForTests();
    });

    it('initializeCategoryFiltersAsync：无写入也上报，且只回调最终结果', async () => {
        mockSearchResults([]);
        const filters = asFilters([categoryRule(['醋']), probeRule()]);
        const onCandidateAvailability = vi.fn();

        await initializeCategoryFiltersAsync(
            filters,
            projectUuid,
            dashboardContext,
            {
                scope: {
                    location: { scope: 'tab', tabUuid: TAB_UUID },
                    chain: tabChain([categoryRule(['醋']), probeRule()]),
                },
                skipFilterIds: ['l4'],
                onCandidateAvailability,
            },
        );

        expect(onCandidateAvailability).toHaveBeenCalledTimes(1);
        expect(onCandidateAvailability).toHaveBeenCalledWith({
            filterId: 'probe',
            status: 'none',
            tabUuid: TAB_UUID,
        });
    });

    it('updateCategoryFilterCascadeAsync：级联无写入也上报（带作用域 tabUuid）', async () => {
        mockSearchResults(['海天']);
        const filters = asFilters([categoryRule(['醋']), probeRule()]);
        const onCandidateAvailability = vi.fn();

        const result = await updateCategoryFilterCascadeAsync(
            filters,
            { ...categoryRule(['酱油']), values: ['酱油'] },
            '酱油',
            projectUuid,
            dashboardContext,
            {
                scope: {
                    location: { scope: 'tab', tabUuid: TAB_UUID },
                    chain: tabChain([categoryRule(['醋']), probeRule()]),
                },
                onCandidateAvailability,
            },
        );

        expect(onCandidateAvailability).toHaveBeenCalledTimes(1);
        expect(onCandidateAvailability).toHaveBeenCalledWith({
            filterId: 'probe',
            status: 'has',
            tabUuid: TAB_UUID,
        });
        // 「任何值」子级不写值
        expect(result.dimensions.find((d) => d.id === 'probe')?.values).toBe(
            undefined,
        );
    });

    it('updateCrossScopeCategoryCascadeAsync：按作用域 tabUuid 上报，全局为 undefined', async () => {
        const globalProbe = probeRule({
            id: 'probe-g',
            target: {
                fieldId: 'insight_list_group',
                tableName: 'insight_list',
            },
            parentFieldId: 'insight_list_cls_4',
            parentScope: 'global',
        });
        const tabProbe = probeRule({
            id: 'probe-t',
            target: {
                fieldId: 'insight_list_brand',
                tableName: 'insight_list',
            },
            parentFieldId: 'insight_list_cls_4',
            parentScope: 'global',
        });
        // 全局探测有候选；Tab 探测无候选
        mockSearchResults(['海天']);
        mockSearchResults([]);

        const onCandidateAvailability = vi.fn();
        await updateCrossScopeCategoryCascadeAsync(
            {
                globalFilters: asFilters([categoryRule(['醋']), globalProbe]),
                tabFilters: { [TAB_UUID]: asFilters([tabProbe]) },
            },
            categoryRule(['酱油']),
            '酱油',
            projectUuid,
            dashboardContext,
            { activeTabUuid: TAB_UUID, onCandidateAvailability },
        );

        expect(api).toHaveBeenCalledTimes(2);
        // 全局探测筛选器会进入 Tab 链：按作用域分别上报
        // （Tab 侧命中 5s 缓存，不会多打仓库请求）
        expect(
            onCandidateAvailability.mock.calls.map((call) => call[0]),
        ).toEqual([
            { filterId: 'probe-g', status: 'has', tabUuid: undefined },
            { filterId: 'probe-g', status: 'has', tabUuid: TAB_UUID },
            { filterId: 'probe-t', status: 'none', tabUuid: TAB_UUID },
        ]);
    });

    it('session 已取消：不探测、不上报', async () => {
        const session = createCategoryRequestSession();
        session.cancel();
        const onCandidateAvailability = vi.fn();

        await initializeCategoryFiltersAsync(
            asFilters([categoryRule(['醋']), probeRule()]),
            projectUuid,
            dashboardContext,
            {
                scope: {
                    location: { scope: 'tab', tabUuid: TAB_UUID },
                    chain: tabChain([categoryRule(['醋']), probeRule()]),
                },
                skipFilterIds: ['l4'],
                session,
                onCandidateAvailability,
            },
        );

        expect(onCandidateAvailability).not.toHaveBeenCalled();
        expect(api).not.toHaveBeenCalled();
    });

    it('探测过程中会话被取消：当次结果回调 unknown，后续筛选器不再上报', async () => {
        const session = createCategoryRequestSession();
        let resolveFirst: ((value: unknown) => void) | undefined;
        api.mockImplementationOnce(
            () =>
                new Promise((resolve) => {
                    resolveFirst = resolve;
                }) as never,
        );

        const filters = asFilters([
            categoryRule(['醋']),
            probeRule({ id: 'probe-a' }),
            probeRule({ id: 'probe-b' }),
        ]);
        const onCandidateAvailability = vi.fn();

        const pending = initializeCategoryFiltersAsync(
            filters,
            projectUuid,
            dashboardContext,
            {
                scope: {
                    location: { scope: 'tab', tabUuid: TAB_UUID },
                    chain: tabChain(filters.dimensions),
                },
                skipFilterIds: ['l4'],
                session,
                onCandidateAvailability,
            },
        );

        // 第一个探测请求已在途
        await vi.waitFor(() => expect(api).toHaveBeenCalledTimes(1));
        expect(onCandidateAvailability).not.toHaveBeenCalled();

        // 用户又操作了一次：旧会话作废
        session.cancel();
        resolveFirst?.({
            search: '',
            results: ['海天'],
            cached: false,
            refreshedAt: new Date(),
        });
        await pending;

        // probe-a：被取消 → 只回调一次 unknown；probe-b：不再探测、不再上报
        expect(onCandidateAvailability).toHaveBeenCalledTimes(1);
        expect(onCandidateAvailability).toHaveBeenCalledWith({
            filterId: 'probe-a',
            status: 'unknown',
            tabUuid: TAB_UUID,
        });
        expect(api).toHaveBeenCalledTimes(1);
    });
});
