import { type DashboardDAO } from './dashboard';
import { type SavedChartDAO } from './savedCharts';
import { type SpaceSummary } from './space';
import { type AllVizChartConfig } from '../visualizations/types';

export enum PromotionAction {
    NO_CHANGES = 'no changes',
    CREATE = 'create',
    UPDATE = 'update',
    DELETE = 'delete',
}

export type PromotedSpace = Omit<SpaceSummary, 'userAccess'>;

export type PromotedDashboard = DashboardDAO & {
    spaceSlug: string;
    spacePath: string;
};
export type PromotedChart = SavedChartDAO & {
    spaceSlug: string;
    spacePath: string;
    oldUuid: string;
};

/**
 * A SQL chart referenced by a dashboard tile, as seen from the project the
 * promotion is coming from. `savedSqlUuid` is the uuid in the source project,
 * `upstreamUuid` is the uuid of the matching chart in the target project
 * (null when it does not exist there yet).
 */
export type PromotedSqlChart = {
    savedSqlUuid: string;
    upstreamUuid: string | null;
    name: string;
    description: string | null;
    slug: string;
    sql: string;
    limit: number;
    config: AllVizChartConfig;
    /**
     * Path of the space the chart belongs to in the source project.
     * Null when the chart is owned by a dashboard.
     */
    spacePath: string | null;
    /**
     * Uuid of the space the chart belongs to in the source project.
     * Null when the chart is owned by a dashboard.
     */
    spaceUuid: string | null;
    /**
     * Uuid of the dashboard that owns the chart in the source project.
     * Null when the chart belongs to a space.
     */
    dashboardUuid: string | null;
    /** Project the chart is promoted to */
    projectUuid: string;
};

/**
 * A data app referenced by a dashboard tile. `uuid` is the app in the source
 * project, `upstreamUuid` is the promoted (production) app.
 */
export type PromotedDataApp = {
    uuid: string;
    name: string;
    upstreamUuid: string | null;
};

export enum PromotionConflictType {
    /**
     * The dashboard in the upstream project was updated after it was promoted
     * for the last time, so promoting again would overwrite those changes.
     */
    UPSTREAM_MODIFIED_AFTER_PROMOTION = 'upstream_modified_after_promotion',
    /**
     * The dashboard in the upstream project has a different name than the one
     * in the source project. By default the upstream name is kept.
     */
    UPSTREAM_NAME_MISMATCH = 'upstream_name_mismatch',
}

export type PromotionConflict = {
    type: PromotionConflictType;
    /** Name of the dashboard in the source project */
    sourceName: string;
    /** Name of the dashboard in the upstream project, null when it does not exist yet */
    upstreamName: string | null;
    /** When the dashboard was promoted for the last time */
    lastPromotedAt: string | null;
    /** When the dashboard in the upstream project was updated for the last time */
    upstreamUpdatedAt: string | null;
};

export type PromotionChanges = {
    spaces: {
        action: PromotionAction;
        data: PromotedSpace;
    }[];
    dashboards: {
        action: PromotionAction;
        data: PromotedDashboard;
    }[];
    charts: {
        action: PromotionAction;
        data: PromotedChart;
    }[];
    sqlCharts: {
        action: PromotionAction;
        data: PromotedSqlChart;
    }[];
    apps: {
        action: PromotionAction;
        data: PromotedDataApp;
    }[];
    /**
     * Changes in the upstream project that need to be confirmed before
     * promoting, otherwise they would be silently overwritten.
     */
    conflicts: PromotionConflict[];
};

export type ApiPromoteChartResponse = {
    status: 'ok';
    results: SavedChartDAO;
};

export type ApiPromoteDashboardResponse = {
    status: 'ok';
    results: DashboardDAO;
};

export type ApiPromotionChangesResponse = {
    status: 'ok';
    results: PromotionChanges;
};

/**
 * Options of a dashboard promotion. They are only needed when the promotion
 * has conflicts that need to be confirmed.
 */
export type PromoteDashboardOptions = {
    /** Confirm that the changes in the upstream project can be overwritten */
    confirmConflicts: boolean;
    /** Copy the name of the source dashboard to the upstream dashboard */
    syncDashboardName: boolean;
};
