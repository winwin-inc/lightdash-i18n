import {
    DimensionType,
    type ChartKind,
    type VizChartLayout,
    type VizIndexLayoutOptions,
    type VizPivotLayoutOptions,
    type VizSqlColumn,
    type VizValuesLayoutOptions,
} from '@lightdash/common';
import { Box } from '@mantine/core';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';

import { AddButton } from '../../VisualizationConfigs/common/AddButton';
import { Config } from '../../VisualizationConfigs/common/Config';
import { FieldReferenceSelect } from '../FieldReferenceSelect';
import {
    useVizDispatch,
    useVizSelector,
    type CartesianChartActionsType,
} from '../store';
import { cartesianChartSelectors } from '../store/selectors';
import { DataVizAggregationConfig } from './DataVizAggregationConfig';

const YFieldsAxisConfig: FC<{
    field: VizChartLayout['y'][number];
    yLayoutOptions: VizValuesLayoutOptions[];
    isSingle: boolean;
    index: number;
    actions: CartesianChartActionsType;
    sqlColumns: VizSqlColumn[];
}> = ({ field, yLayoutOptions, isSingle, index, actions, sqlColumns }) => {
    const { t } = useTranslation();
    const dispatch = useVizDispatch();

    return (
        <>
            <Box
                sx={(theme) => ({
                    paddingLeft: !isSingle ? theme.spacing.xs : 0,
                    borderLeft: !isSingle
                        ? `1px solid ${theme.colors.gray[3]}`
                        : 0,
                })}
            >
                <Config>
                    <Config.Section>
                        <FieldReferenceSelect
                            clearable
                            data={yLayoutOptions.map((y) => ({
                                value: y.reference,
                                label: y.reference,
                            }))}
                            value={field.reference}
                            error={
                                yLayoutOptions.find(
                                    (y) => y.reference === field.reference,
                                ) === undefined &&
                                t(
                                    'features_sql_runner_bar_chart_field_configuartaion.column_not_in_sql',
                                    {
                                        reference: field.reference,
                                    },
                                )
                            }
                            placeholder={t(
                                'features_sql_runner_bar_chart_field_configuartaion.select_y_axis',
                            )}
                            onChange={(value) => {
                                if (!value) {
                                    dispatch(actions.removeYAxisField(index));
                                } else
                                    dispatch(
                                        actions.setYAxisReference({
                                            reference: value,
                                            index,
                                        }),
                                    );
                            }}
                            fieldType={
                                sqlColumns?.find(
                                    (x) => x.reference === field.reference,
                                )?.type ?? DimensionType.STRING
                            }
                        />

                        <Config.Group>
                            <Config.Label>
                                {t(
                                    'features_sql_runner_bar_chart_field_configuartaion.aggregation',
                                )}
                            </Config.Label>

                            <DataVizAggregationConfig
                                options={
                                    yLayoutOptions.find(
                                        (layout) =>
                                            layout.reference ===
                                            field.reference,
                                    )?.aggregationOptions
                                }
                                aggregation={field.aggregation}
                                onChangeAggregation={(value) =>
                                    dispatch(
                                        actions.setYAxisAggregation({
                                            index,
                                            aggregation: value,
                                        }),
                                    )
                                }
                            />
                        </Config.Group>
                    </Config.Section>
                </Config>
            </Box>
        </>
    );
};

const XFieldAxisConfig = ({
    field,
    xLayoutOptions,
    actions,
    sqlColumns,
}: {
    sqlColumns: VizSqlColumn[];

    field: VizChartLayout['x'] | undefined;
    xLayoutOptions: VizIndexLayoutOptions[];
    actions: CartesianChartActionsType;
}) => {
    const { t } = useTranslation();
    const dispatch = useVizDispatch();

    return (
        <FieldReferenceSelect
            clearable
            data={xLayoutOptions.map((x) => ({
                value: x.reference,
                label: x.reference,
            }))}
            value={field?.reference ?? null}
            placeholder={t(
                'features_sql_runner_bar_chart_field_configuartaion.select_x_axis',
            )}
            onChange={(value) => {
                if (!value) {
                    dispatch(actions.removeXAxisField());
                } else dispatch(actions.setXAxisReference(value));
            }}
            error={
                field?.reference &&
                xLayoutOptions.find((x) => x.reference === field.reference) ===
                    undefined &&
                t(
                    'features_sql_runner_bar_chart_field_configuartaion.column_not_in_sql_query',
                    {
                        reference: field.reference,
                    },
                )
            }
            fieldType={
                (field?.reference &&
                    sqlColumns?.find((x) => x.reference === field.reference)
                        ?.type) ||
                DimensionType.STRING
            }
        />
    );
};

const GroupByFieldAxisConfig = ({
    field,
    groupByOptions = [],
    actions,
    sqlColumns,
}: {
    sqlColumns: VizSqlColumn[];

    field: undefined | { reference: string };
    groupByOptions?: VizPivotLayoutOptions[];
    actions: CartesianChartActionsType;
}) => {
    const { t } = useTranslation();
    const dispatch = useVizDispatch();

    return (
        <FieldReferenceSelect
            clearable
            data={groupByOptions.map((groupBy) => ({
                value: groupBy.reference,
                label: groupBy.reference,
            }))}
            value={field?.reference ?? null}
            placeholder={t(
                'features_sql_runner_bar_chart_field_configuartaion.select_group_by',
            )}
            error={
                field !== undefined &&
                !groupByOptions.find((x) => x.reference === field.reference) &&
                t(
                    'features_sql_runner_bar_chart_field_configuartaion.column_not_in_sql_group',
                    {
                        reference: field.reference,
                    },
                )
            }
            onChange={(value) => {
                if (!value) {
                    dispatch(actions.unsetGroupByReference());
                } else {
                    dispatch(
                        actions.setGroupByReference({
                            reference: value,
                        }),
                    );
                }
            }}
            fieldType={
                sqlColumns?.find((x) => x.reference === field?.reference)
                    ?.type ?? DimensionType.STRING
            }
        />
    );
};

export const CartesianChartFieldConfiguration = ({
    sqlColumns,
    actions,
    selectedChartType,
}: {
    selectedChartType: ChartKind;
    sqlColumns: VizSqlColumn[];

    actions: CartesianChartActionsType;
}) => {
    const { t } = useTranslation();
    const dispatch = useVizDispatch();
    const xLayoutOptions = useVizSelector((state) =>
        cartesianChartSelectors.getIndexLayoutOptions(state, selectedChartType),
    );
    const yLayoutOptions = useVizSelector((state) =>
        cartesianChartSelectors.getValuesLayoutOptions(
            state,
            selectedChartType,
        ),
    );
    const xAxisField = useVizSelector((state) =>
        cartesianChartSelectors.getXAxisField(state, selectedChartType),
    );
    const yAxisFields = useVizSelector((state) =>
        cartesianChartSelectors.getYAxisFields(state, selectedChartType),
    );
    const groupByField = useVizSelector((state) =>
        cartesianChartSelectors.getGroupByField(state, selectedChartType),
    );
    const groupByLayoutOptions = useVizSelector((state) =>
        cartesianChartSelectors.getPivotLayoutOptions(state, selectedChartType),
    );
    return (
        <>
            <Config>
                <Config.Section>
                    <Config.Heading>
                        {t(
                            'features_sql_runner_bar_chart_field_configuartaion.x_axis',
                        )}
                    </Config.Heading>
                    {xLayoutOptions && (
                        <XFieldAxisConfig
                            sqlColumns={sqlColumns}
                            field={xAxisField}
                            xLayoutOptions={xLayoutOptions}
                            actions={actions}
                        />
                    )}
                </Config.Section>
            </Config>
            <Config>
                <Config.Section>
                    <Config.Group>
                        <Config.Heading>
                            {t(
                                'features_sql_runner_bar_chart_field_configuartaion.y_axis',
                            )}
                        </Config.Heading>
                        <AddButton
                            onClick={() => dispatch(actions.addYAxisField())}
                        ></AddButton>
                    </Config.Group>
                    {yLayoutOptions &&
                        yAxisFields &&
                        yAxisFields.map((field, index) => (
                            <YFieldsAxisConfig
                                key={field.reference + index}
                                field={field}
                                yLayoutOptions={yLayoutOptions}
                                isSingle={yAxisFields.length === 1}
                                index={index}
                                actions={actions}
                                sqlColumns={sqlColumns}
                            />
                        ))}
                </Config.Section>
            </Config>
            <Config>
                <Config.Section>
                    <Config.Heading>
                        {t(
                            'features_sql_runner_bar_chart_field_configuartaion.group_by',
                        )}
                    </Config.Heading>
                    <GroupByFieldAxisConfig
                        sqlColumns={sqlColumns}
                        field={groupByField}
                        groupByOptions={groupByLayoutOptions}
                        actions={actions}
                    />
                </Config.Section>
            </Config>
        </>
    );
};
