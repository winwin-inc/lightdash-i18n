import { type PartialDeep } from 'type-fest';
import type { DashboardAsCodeLanguageMap } from '../../utils/i18n/dashboardAsCode';
import type {
    Dashboard,
    DashboardChartTileProperties,
    DashboardConfig,
    DashboardDataAppTileProperties,
    DashboardLoomTileProperties,
    DashboardMarkdownTileProperties,
    DashboardSqlChartTileProperties,
    DashboardTab,
    DashboardTile,
    DashboardTileTypes,
} from '../dashboard';
import type { DashboardFilterRule, DashboardFilters } from '../filter';
import type { PromotionChanges } from '../promotion';
import type { ContentAsCodeType } from './core';
import type { SpaceAsCode } from './spaces';

type DashboardTileAsCodeBase = {
    uuid: DashboardTile['uuid'] | undefined;
    tileSlug: string | undefined;
    type: DashboardTileTypes;
    x: DashboardTile['x'];
    y: DashboardTile['y'];
    h: DashboardTile['h'];
    w: DashboardTile['w'];
    /** Portable reference to the dashboard tab containing this tile. */
    tabSlug?: string | null;
    /** Legacy project-local tab reference. Accepted on upload for backwards compatibility. */
    tabUuid?: DashboardTile['tabUuid'];
};

export type DashboardChartTileAsCode = DashboardTileAsCodeBase & {
    type: DashboardTileTypes.SAVED_CHART;
    properties: Pick<
        DashboardChartTileProperties['properties'],
        'title' | 'hideTitle' | 'chartName'
    > & { chartSlug: string | null };
};

export type DashboardSqlChartTileAsCode = DashboardTileAsCodeBase & {
    type: DashboardTileTypes.SQL_CHART;
    properties: Pick<
        DashboardSqlChartTileProperties['properties'],
        'title' | 'hideTitle' | 'chartName'
    > & { chartSlug: string | null };
};

export type DashboardMarkdownTileAsCode = DashboardTileAsCodeBase & {
    type: DashboardTileTypes.MARKDOWN;
    properties: DashboardMarkdownTileProperties['properties'];
};

export type DashboardLoomTileAsCode = DashboardTileAsCodeBase & {
    type: DashboardTileTypes.LOOM;
    properties: DashboardLoomTileProperties['properties'];
};

export type DashboardDataAppTileAsCode = DashboardTileAsCodeBase & {
    type: DashboardTileTypes.DATA_APP;
    properties: Pick<
        DashboardDataAppTileProperties['properties'],
        'title' | 'hideTitle'
    > & {
        appSlug?: string | null;
        appUuid?: string;
        appDeletedAt?: string | null;
    };
};

export type DashboardTileAsCode = Omit<DashboardTile, 'properties' | 'uuid'> & {
    uuid: DashboardTile['uuid'] | undefined;
    tileSlug: string | undefined;
    tabSlug?: string | null;
    properties:
        | Pick<
              DashboardChartTileProperties['properties'],
              'title' | 'hideTitle' | 'chartSlug' | 'chartName'
          >
        | DashboardMarkdownTileProperties['properties']
        | DashboardLoomTileProperties['properties']
        | Pick<
              DashboardSqlChartTileProperties['properties'],
              'title' | 'hideTitle' | 'chartName' | 'chartSlug'
          >
        | Pick<
              DashboardDataAppTileProperties['properties'],
              'title' | 'hideTitle' | 'appUuid' | 'appSlug' | 'appDeletedAt'
          >;
};

export type DashboardTileWithSlug = DashboardTile & {
    tileSlug: string | undefined;
};

export type DashboardTabAsCode = {
    slug?: string;
    uuid?: DashboardTab['uuid'];
    name: string;
    order: number;
    hidden?: DashboardTab['hidden'];
    /** Fork-specific tab-level filters. Must survive as-code round-trip. */
    filters?: DashboardFilters;
};

export type DashboardAsCode = Pick<
    Dashboard,
    'name' | 'description' | 'updatedAt' | 'slug'
> & {
    tabs: Array<DashboardTab | DashboardTabAsCode>;
    tiles: DashboardTileAsCode[];
    version: number;
    contentType?: ContentAsCodeType.DASHBOARD;
    spaceSlug: string;
    downloadedAt?: Date;
    filters: Omit<DashboardFilters, 'dimensions'> & {
        dimensions: Omit<DashboardFilterRule, 'id'>[];
    };
    config?: DashboardConfig;
    parameters?: Dashboard['parameters'];
    ownerEmail?: string | null;
    verified?: boolean;
};

export type ApiDashboardAsCodeListResponse = {
    status: 'ok';
    results: {
        dashboards: DashboardAsCode[];
        languageMap:
            | Array<
                  | PartialDeep<
                        DashboardAsCodeLanguageMap,
                        { recurseIntoArrays: true }
                    >
                  | undefined
              >
            | undefined;
        missingIds: string[];
        spaces: SpaceAsCode[];
        total: number;
        offset: number;
    };
};

export type DashboardAsCodeUpsertResult = PromotionChanges & {
    warnings?: string[];
};

export type ApiDashboardAsCodeUpsertResponse = {
    status: 'ok';
    results: DashboardAsCodeUpsertResult;
};
