import {
    type DashboardAsCode,
    type DashboardConfig,
    type DashboardDAO,
    type DashboardFilterRule,
    type DashboardFilters,
    type DashboardTab,
    type DashboardTabAsCode,
    type DashboardTile,
    type DashboardTileAsCode,
    type DashboardTileWithSlug,
} from '@lightdash/common';
import { v4 as uuidv4 } from 'uuid';

const isUuid = (value: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        value,
    );

const getIncomingTabSlug = (
    tab: DashboardTab | DashboardTabAsCode,
): string | undefined => (tab as DashboardTabAsCode).slug;

export type ResolvedDashboardTab = DashboardTab & { slug: string };

export const getDashboardTabBaseSlug = (
    tab: Pick<DashboardTab | DashboardTabAsCode, 'name' | 'order'>,
): string => {
    const slug = tab.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    return slug || `tab-${tab.order + 1}`;
};

export const getDashboardTabSlug = (
    dashboard: Pick<DashboardDAO, 'tabs'>,
    tabUuid: string,
): string | undefined => {
    const tab = dashboard.tabs.find(({ uuid }) => uuid === tabUuid);
    if (!tab) return undefined;
    const baseSlug = getDashboardTabBaseSlug(tab);
    const matchingTabs = dashboard.tabs
        .filter((candidate) => getDashboardTabBaseSlug(candidate) === baseSlug)
        .sort((left, right) => left.order - right.order);
    if (matchingTabs.length === 1) return baseSlug;
    const index = matchingTabs.findIndex(({ uuid }) => uuid === tabUuid);
    return `${baseSlug}-${index + 1}`;
};

export const resolveDashboardTabs = (
    incoming: DashboardAsCode['tabs'],
    existingTabs: DashboardDAO['tabs'] | undefined = [],
): ResolvedDashboardTab[] => {
    const existingBySlug = new Map(
        existingTabs.map((tab) => [
            getDashboardTabSlug({ tabs: existingTabs }, tab.uuid) ?? tab.uuid,
            tab,
        ]),
    );
    const existingByUuid = new Map(existingTabs.map((tab) => [tab.uuid, tab]));
    const usedSlugs = new Set<string>();

    return incoming.map((tab, index) => {
        const incomingSlug = getIncomingTabSlug(tab);
        const preferredSlug =
            incomingSlug && !isUuid(incomingSlug)
                ? incomingSlug
                : getDashboardTabBaseSlug({
                      name: tab.name,
                      order: tab.order ?? index,
                  });
        let slug = preferredSlug;
        let suffix = 2;
        while (usedSlugs.has(slug)) {
            slug = `${preferredSlug}-${suffix}`;
            suffix += 1;
        }
        usedSlugs.add(slug);

        const existing =
            (tab.uuid ? existingByUuid.get(tab.uuid) : undefined) ??
            existingBySlug.get(slug);
        return {
            uuid: existing?.uuid || tab.uuid || uuidv4(),
            name: tab.name,
            order: tab.order ?? index,
            hidden: tab.hidden,
            slug,
        };
    });
};

export const resolveTabUuid = (
    tabs: ResolvedDashboardTab[],
    tabSlug?: string | null,
    tabUuid?: string,
): string | undefined => {
    if (tabSlug) {
        const bySlug = tabs.find((tab) => tab.slug === tabSlug);
        if (bySlug) return bySlug.uuid;
        const byLegacyUuid = tabs.find((tab) => tab.uuid === tabSlug);
        if (byLegacyUuid) return byLegacyUuid.uuid;
    }
    if (tabUuid) {
        const byUuid = tabs.find((tab) => tab.uuid === tabUuid);
        if (byUuid) return byUuid.uuid;
    }
    return undefined;
};

const remapRecordKeys = (
    record: Record<string, boolean> | undefined,
    resolveKey: (key: string) => string | undefined,
    warnings: string[],
    label: string,
): Record<string, boolean> | undefined => {
    if (!record) return record;
    return Object.entries(record).reduce<Record<string, boolean>>(
        (acc, [key, value]) => {
            const nextKey = resolveKey(key);
            if (!nextKey) {
                warnings.push(`Skipped ${label} entry "${key}"`);
                return acc;
            }
            return { ...acc, [nextKey]: value };
        },
        {},
    );
};

export const getConfigWithPortableRefs = (
    dashboard: DashboardDAO,
    getTileSlug: (tileUuid: string) => string | undefined,
): DashboardConfig | undefined => {
    const { config } = dashboard;
    if (!config) return config;
    const warnings: string[] = [];
    const resolveTabKey = (key: string) =>
        getDashboardTabSlug(dashboard, key) ?? (isUuid(key) ? undefined : key);
    const portable: DashboardConfig = {
        ...config,
        tabFilterEnabled: remapRecordKeys(
            config.tabFilterEnabled,
            resolveTabKey,
            warnings,
            'tabFilterEnabled',
        ),
        showTabAddFilterButton: remapRecordKeys(
            config.showTabAddFilterButton,
            resolveTabKey,
            warnings,
            'showTabAddFilterButton',
        ),
        syncChartTileUuids: config.syncChartTileUuids
            ?.map((tileUuid) => getTileSlug(tileUuid) ?? tileUuid)
            .filter((value) => !isUuid(value)),
    };
    return portable;
};

export const getConfigWithLocalRefs = (
    config: DashboardConfig | undefined,
    tabs: ResolvedDashboardTab[],
    tiles: DashboardTileWithSlug[],
    warnings: string[],
): DashboardConfig | undefined => {
    if (!config) return config;
    const resolveTabKey = (key: string) => resolveTabUuid(tabs, key, key);
    const resolveTileUuid = (slugOrUuid: string) =>
        tiles.find(
            (tile) =>
                tile.uuid === slugOrUuid ||
                tile.tileSlug === slugOrUuid ||
                ('chartSlug' in tile.properties &&
                    tile.properties.chartSlug === slugOrUuid),
        )?.uuid;

    return {
        ...config,
        tabFilterEnabled: remapRecordKeys(
            config.tabFilterEnabled,
            resolveTabKey,
            warnings,
            'tabFilterEnabled',
        ),
        showTabAddFilterButton: remapRecordKeys(
            config.showTabAddFilterButton,
            resolveTabKey,
            warnings,
            'showTabAddFilterButton',
        ),
        syncChartTileUuids: config.syncChartTileUuids
            ?.map((slugOrUuid) => {
                const tileUuid = resolveTileUuid(slugOrUuid);
                if (!tileUuid) {
                    warnings.push(
                        `Skipped syncChartTileUuids entry "${slugOrUuid}"`,
                    );
                }
                return tileUuid;
            })
            .filter((value): value is string => Boolean(value)),
    };
};

const remapLockedTabRefs = (
    lockedTabUuids: string[] | undefined,
    resolve: (value: string) => string | undefined,
    warnings: string[],
): string[] | undefined => {
    if (!lockedTabUuids) return lockedTabUuids;
    return lockedTabUuids
        .map((value) => {
            const next = resolve(value);
            if (!next) {
                warnings.push(`Skipped lockedTabUuids entry "${value}"`);
            }
            return next;
        })
        .filter((value): value is string => Boolean(value));
};

type FilterRuleWithLockedTabs = { lockedTabUuids?: string[] };
type FiltersWithLockedTabs = {
    dimensions?: FilterRuleWithLockedTabs[];
    metrics?: FilterRuleWithLockedTabs[];
    tableCalculations?: FilterRuleWithLockedTabs[];
};

export const getFiltersWithPortableLockedTabs = <
    T extends FiltersWithLockedTabs,
>(
    dashboard: DashboardDAO,
    filters: T,
): T => {
    const resolve = (tabUuid: string) =>
        getDashboardTabSlug(dashboard, tabUuid);
    const mapRule = <TRule extends FilterRuleWithLockedTabs>(
        rule: TRule,
    ): TRule => ({
        ...rule,
        lockedTabUuids: remapLockedTabRefs(rule.lockedTabUuids, resolve, []),
    });
    return {
        ...filters,
        dimensions: (filters.dimensions ?? []).map(mapRule),
        metrics: (filters.metrics ?? []).map(mapRule),
        tableCalculations: (filters.tableCalculations ?? []).map(mapRule),
    };
};

export const getFiltersWithLocalLockedTabs = (
    filters: DashboardFilters,
    tabs: ResolvedDashboardTab[],
    warnings: string[],
): DashboardFilters => {
    const resolve = (value: string) => resolveTabUuid(tabs, value, value);
    const mapRule = (rule: DashboardFilterRule): DashboardFilterRule => ({
        ...rule,
        lockedTabUuids: remapLockedTabRefs(
            rule.lockedTabUuids,
            resolve,
            warnings,
        ),
    });
    return {
        dimensions: (filters.dimensions ?? []).map(mapRule),
        metrics: (filters.metrics ?? []).map(mapRule),
        tableCalculations: (filters.tableCalculations ?? []).map(mapRule),
    };
};

export const applyResolvedTabUuidsToTiles = (
    tiles: DashboardTileWithSlug[],
    tabs: ResolvedDashboardTab[],
): DashboardTileWithSlug[] =>
    tiles.map((tile) => ({
        ...tile,
        tabUuid: resolveTabUuid(
            tabs,
            'tabSlug' in tile
                ? (tile as { tabSlug?: string | null }).tabSlug
                : undefined,
            tile.tabUuid,
        ),
    }));

export const isEmptyDashboardFilters = (
    filters: DashboardFilters | undefined,
): boolean =>
    !filters ||
    ((filters.dimensions?.length ?? 0) === 0 &&
        (filters.metrics?.length ?? 0) === 0 &&
        (filters.tableCalculations?.length ?? 0) === 0);

export const toAsCodeTabs = (
    dashboard: DashboardDAO,
    tabs: DashboardAsCode['tabs'],
): DashboardAsCode['tabs'] =>
    tabs.map((tab) => {
        const { filters, ...tabWithoutEmptyFilters } = tab as DashboardTab & {
            filters?: DashboardFilters;
        };
        const nextTab = {
            ...tabWithoutEmptyFilters,
            slug:
                ('uuid' in tab && tab.uuid
                    ? getDashboardTabSlug(dashboard, tab.uuid)
                    : undefined) ??
                getIncomingTabSlug(tab) ??
                getDashboardTabBaseSlug(tab),
            uuid: tab.uuid,
        };
        if (isEmptyDashboardFilters(filters)) {
            return nextTab;
        }
        return { ...nextTab, filters };
    });

export const getTileTabSlug = (
    dashboard: DashboardDAO,
    tile: DashboardTile | DashboardTileAsCode,
): string | undefined =>
    tile.tabUuid ? getDashboardTabSlug(dashboard, tile.tabUuid) : undefined;
