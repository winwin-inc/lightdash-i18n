import { type PartialDeep } from 'type-fest';
import type { ChartAsCodeLanguageMap } from '../../utils/i18n/chartAsCode';
import type { MetricQuery } from '../metricQuery';
import type { PromotionChanges } from '../promotion';
import type { SavedChart } from '../savedCharts';
import type { SqlChart } from '../sqlRunner';
import type { ContentAsCodeType, FiltersInput } from './core';
import type { SpaceAsCode } from './spaces';

export type ChartAsCode = Pick<
    SavedChart,
    | 'name'
    | 'description'
    | 'tableName'
    | 'chartConfig'
    | 'tableConfig'
    | 'pivotConfig'
    | 'slug'
    | 'updatedAt'
> & {
    metricQuery: MetricQuery | (Omit<MetricQuery, 'filters'> & { filters: FiltersInput });
    dashboardSlug: string | undefined;
    version: number;
    spaceSlug: string;
    downloadedAt?: Date;
    contentType?: ContentAsCodeType.CHART;
    parameters?: SavedChart['parameters'];
    merge?: SavedChart['merge'];
    /** Ignored on upload when the instance has no verification feature. */
    verified?: boolean;
};

export type SqlChartAsCode = Pick<
    SqlChart,
    'name' | 'description' | 'slug' | 'sql' | 'limit' | 'config' | 'chartKind'
> & {
    version: number;
    contentType?: ContentAsCodeType.SQL_CHART;
    spaceSlug: string;
    updatedAt?: Date;
    downloadedAt?: Date;
};

export type ApiChartAsCodeListResponse = {
    status: 'ok';
    results: {
        charts: ChartAsCode[];
        languageMap:
            | Array<
                  | PartialDeep<
                        ChartAsCodeLanguageMap,
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

export type ApiChartAsCodeUpsertResponse = {
    status: 'ok';
    results: PromotionChanges;
};

export type ApiSqlChartAsCodeUpsertResponse = {
    status: 'ok';
    results: PromotionChanges;
};

export type ApiSqlChartAsCodeListResponse = {
    status: 'ok';
    results: {
        sqlCharts: SqlChartAsCode[];
        missingIds: string[];
        spaces: SpaceAsCode[];
        total: number;
        offset: number;
    };
};
