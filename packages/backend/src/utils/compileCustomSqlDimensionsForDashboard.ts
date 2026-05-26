import {
    type CompiledCustomSqlDimension,
    type CustomSqlDimension,
    type DashboardFilterableCustomSqlDimension,
    type Explore,
    ExploreCompiler,
    getAvailableParametersFromTables,
    isFilterableCustomSqlDimension,
} from '@lightdash/common';
import { warehouseSqlBuilderFromType } from '@lightdash/warehouses';

export function enrichCompiledCustomSqlDimensionForDashboard(
    compiled: CompiledCustomSqlDimension,
    explore: Explore,
): DashboardFilterableCustomSqlDimension {
    return {
        ...compiled,
        label: compiled.name,
        tableLabel: explore.tables[compiled.table]?.label ?? compiled.table,
    };
}

/**
 * 将图表中已选中的 Custom SQL 维度编译为带 label/tableLabel 的字段，供看板筛选候选使用。
 */
export function compileFilterableCustomSqlDimensionsForExplore(
    explore: Explore,
    customSqlDimensions: CustomSqlDimension[],
): DashboardFilterableCustomSqlDimension[] {
    if (customSqlDimensions.length === 0) return [];

    const sqlBuilder = warehouseSqlBuilderFromType(explore.targetDatabase);
    const compiler = new ExploreCompiler(sqlBuilder);
    const availableParameters = Object.keys(
        getAvailableParametersFromTables(Object.values(explore.tables)),
    );

    return customSqlDimensions
        .filter(isFilterableCustomSqlDimension)
        .map((cd) => {
            try {
                const compiled = compiler.compileCustomDimension(
                    cd,
                    explore.tables,
                    availableParameters,
                );
                if (!('compiledSql' in compiled)) {
                    return null;
                }
                return enrichCompiledCustomSqlDimensionForDashboard(
                    compiled,
                    explore,
                );
            } catch {
                return null;
            }
        })
        .filter((x): x is DashboardFilterableCustomSqlDimension => x !== null);
}
