import {
    BarChartDataTransformer,
    isBarChartSQLConfig,
    isPieChartSQLConfig,
    PieChartDataTransformer,
    type ResultRow,
    type SqlColumn,
    type SqlRunnerChartConfig,
} from '@lightdash/common';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useAsync } from 'react-use';

import { SqlRunnerResultsTransformerFE } from './SqlRunnerResultsTransformerFE';

export const useSqlChart = (
    rows: ResultRow[],
    columns: SqlColumn[],
    config: SqlRunnerChartConfig,
) => {
    const { t } = useTranslation();

    const transformer = useMemo(
        () =>
            new SqlRunnerResultsTransformerFE({
                rows,
                columns,
            }),
        [rows, columns],
    );

    const visTransformer = useMemo(() => {
        if (isBarChartSQLConfig(config)) {
            return new BarChartDataTransformer({
                transformer,
            });
        } else if (isPieChartSQLConfig(config)) {
            return new PieChartDataTransformer({
                transformer,
            });
        } else {
            throw new Error(
                t(
                    'features_sql_runner_transformers_sql_chart.unknown_chart_type',
                ),
            );
        }
    }, [config, transformer, t]);

    return useAsync(
        async () => visTransformer.getEchartsSpec(config),
        [config, visTransformer],
    );
};
