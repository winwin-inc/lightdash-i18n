import { DimensionType, type VizSqlColumn } from '@lightdash/common';
import { Stack, Title } from '@mantine/core';
import { useTranslation } from 'react-i18next';

import { Config } from '../../VisualizationConfigs/common/Config';
import { FieldReferenceSelect } from '../FieldReferenceSelect';
import { useVizDispatch, useVizSelector } from '../store';
import {
    setGroupFieldIds,
    setYAxisAggregation,
    setYAxisReference,
} from '../store/pieChartSlice';
import { DataVizAggregationConfig } from './DataVizAggregationConfig';

export const PieChartConfiguration = ({
    sqlColumns,
}: {
    sqlColumns: VizSqlColumn[];
}) => {
    const { t } = useTranslation();
    const dispatch = useVizDispatch();

    const groupField = useVizSelector(
        (state) => state.pieChartConfig.config?.fieldConfig?.x?.reference,
    );
    const groupFieldOptions = useVizSelector(
        (state) => state.pieChartConfig.options.groupFieldOptions,
    );

    const aggregateField = useVizSelector(
        (state) => state.pieChartConfig.config?.fieldConfig?.y[0],
    );

    const aggregateFieldOptions = useVizSelector(
        (state) => state.pieChartConfig.options.metricFieldOptions,
    );

    return (
        <Stack spacing="sm" mb="lg">
            <Title order={5} fz="sm" c="gray.9">
                {t('features_sql_runner_pie_chart_configuration.data')}
            </Title>

            <Config.Section>
                <Config.Heading>
                    {t('features_sql_runner_pie_chart_configuration.group_by')}
                </Config.Heading>

                <FieldReferenceSelect
                    data={groupFieldOptions.map((x) => ({
                        value: x.reference,
                        label: x.reference,
                    }))}
                    disabled={groupFieldOptions.length === 0}
                    value={groupField}
                    placeholder={t(
                        'features_sql_runner_pie_chart_configuration.select_group_by',
                    )}
                    onChange={(value) => {
                        if (!value) return;
                        const field = groupFieldOptions.find(
                            (x) => x.reference === value,
                        );
                        if (!field) return;
                        dispatch(setGroupFieldIds(field));
                    }}
                    error={
                        !!groupField &&
                        groupFieldOptions.find(
                            (x) => x.reference === groupField,
                        ) === undefined &&
                        t(
                            'features_sql_runner_pie_chart_configuration.column_not_in_sql_query',
                            {
                                field: groupField,
                            },
                        )
                    }
                    fieldType={
                        sqlColumns?.find((x) => x.reference === groupField)
                            ?.type ?? DimensionType.STRING
                    }
                />
            </Config.Section>

            <Config.Section>
                <Config.Heading>
                    {t(
                        'features_sql_runner_pie_chart_configuration.aggregate_by',
                    )}
                </Config.Heading>

                <FieldReferenceSelect
                    data={aggregateFieldOptions.map((y) => ({
                        value: y.reference,
                        label: y.reference,
                    }))}
                    value={aggregateField?.reference}
                    error={
                        aggregateFieldOptions.find(
                            (y) => y.reference === aggregateField?.reference,
                        ) === undefined &&
                        t(
                            'features_sql_runner_pie_chart_configuration.column_not_in_sql_aggregate',
                            {
                                reference: aggregateField?.reference,
                            },
                        )
                    }
                    placeholder={t(
                        'features_sql_runner_pie_chart_configuration.select_y_axis',
                    )}
                    onChange={(value) => {
                        if (!value) return;
                        dispatch(
                            setYAxisReference({
                                reference: value,
                                index: 0,
                            }),
                        );
                    }}
                    fieldType={
                        sqlColumns?.find(
                            (x) => x.reference === aggregateField?.reference,
                        )?.type ?? DimensionType.STRING
                    }
                />

                <Config.Group>
                    <Config.Label>
                        {t(
                            'features_sql_runner_pie_chart_configuration.aggregation',
                        )}
                    </Config.Label>

                    <DataVizAggregationConfig
                        options={
                            aggregateFieldOptions.find(
                                (layout) =>
                                    layout.reference ===
                                    aggregateField?.reference,
                            )?.aggregationOptions
                        }
                        aggregation={aggregateField?.aggregation}
                        onChangeAggregation={(value) => {
                            dispatch(
                                setYAxisAggregation({
                                    index: 0,
                                    aggregation: value,
                                }),
                            );
                        }}
                    />
                </Config.Group>
            </Config.Section>
        </Stack>
    );
};
