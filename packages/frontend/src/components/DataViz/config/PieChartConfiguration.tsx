import { DimensionType, type VizColumn } from '@lightdash/common';
import { Stack, Title } from '@mantine/core';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
    useAppDispatch as useVizDispatch,
    useAppSelector as useVizSelector,
} from '../../../features/sqlRunner/store/hooks';
import { Config } from '../../VisualizationConfigs/common/Config';
import { FieldReferenceSelect } from '../FieldReferenceSelect';
import {
    setGroupFieldIds,
    setYAxisAggregation,
    setYAxisReference,
} from '../store/pieChartSlice';
import { DataVizAggregationConfig } from './DataVizAggregationConfig';

export const PieChartConfiguration = ({
    columns,
}: {
    columns: VizColumn[];
}) => {
    const { t } = useTranslation();
    const dispatch = useVizDispatch();

    const groupField = useVizSelector(
        (state) => state.pieChartConfig.fieldConfig?.x?.reference,
    );
    const groupFieldOptions = useVizSelector(
        (state) => state.pieChartConfig.options.groupFieldOptions,
    );

    const aggregateField = useVizSelector(
        (state) => state.pieChartConfig.fieldConfig?.y[0],
    );

    const aggregateFieldOptions = useVizSelector(
        (state) => state.pieChartConfig.options.customMetricFieldOptions,
    );

    const errors = useVizSelector((state) => state.pieChartConfig.errors);

    const errorMessage = useMemo(() => {
        return errors?.groupByFieldError?.references
            ? t(
                  'features_sql_runner_pie_chart_configuration.column_not_in_sql_query',
                  {
                      field: errors?.groupByFieldError?.references[0],
                  },
              )
            : undefined;
    }, [errors?.groupByFieldError?.references, t]);

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
                        errors?.groupByFieldError?.references
                            ? t('features_sql_runner_pie_chart_configuration', {
                                  reference:
                                      errors?.groupByFieldError?.references[0],
                              })
                            : undefined
                    }
                    fieldType={
                        columns?.find((x) => x.reference === groupField)
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
                    error={errorMessage}
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
                        columns?.find(
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
