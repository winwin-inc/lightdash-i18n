/**
 * Closed registry of resource types that support direct access grants.
 * Minimal stub for Phase C apps wiring — expand when directAccess ships.
 */
export enum DirectAccessResourceType {
    DASHBOARD = 'dashboard',
    CHART = 'chart',
    SQL_CHART = 'sqlChart',
    APP = 'app',
    SPACE = 'space',
    DATA_APP = 'data_app',
}
