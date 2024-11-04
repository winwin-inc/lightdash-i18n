import {
    DimensionType,
    type ChartKind,
    type PivotChartLayout,
    type VizColumn,
    type VizConfigErrors,
    type VizIndexLayoutOptions,
    type VizPivotLayoutOptions,
} from '@lightdash/common';
import { ActionIcon, Box, Group, Stack, Tooltip } from '@mantine/core';
import { IconMinus, IconPlus, IconX } from '@tabler/icons-react';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import {
    useAppDispatch as useVizDispatch,
    useAppSelector as useVizSelector,
} from '../../../features/sqlRunner/store/hooks';
import MantineIcon from '../../common/MantineIcon';
import { Config } from '../../VisualizationConfigs/common/Config';
import { FieldReferenceSelect } from '../FieldReferenceSelect';
import { type BarChartActionsType } from '../store/barChartSlice';
import { type LineChartActionsType } from '../store/lineChartSlice';
import { cartesianChartSelectors } from '../store/selectors';
import { DataVizAggregationConfig } from './DataVizAggregationConfig';
import { DataVizSortConfig } from './DataVizSortConfig';

const YFieldsAxisConfig: FC<{
    field: PivotChartLayout['y'][number];
    yLayoutOptions: VizIndexLayoutOptions[];
    isSingle: boolean;
    index: number;
    actions: BarChartActionsType | LineChartActionsType;
    columns: VizColumn[];
    error:
        | NonNullable<
              VizConfigErrors['customMetricFieldError']
          >['references'][number]
        | undefined;
}> = ({ field, yLayoutOptions, isSingle, index, actions, columns, error }) => {
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
                        <Group spacing="xs">
                            <FieldReferenceSelect
                                sx={{
                                    flex: 1,
                                }}
                                data={yLayoutOptions.map((y) => ({
                                    value: y.reference,
                                    label: y.reference,
                                }))}
                                value={field.reference}
                                error={
                                    !!error &&
                                    t(
                                        'features_sql_runner_bar_chart_field_configuartaion',
                                        {
                                            reference: error,
                                        },
                                    )
                                }
                                placeholder={t(
                                    'features_sql_runner_bar_chart_field_configuartaion.select_y_axis',
                                )}
                                onChange={(value) => {
                                    if (value) {
                                        dispatch(
                                            actions.setYAxisReference({
                                                reference: value,
                                                index,
                                            }),
                                        );
                                    }
                                }}
                                fieldType={
                                    columns?.find(
                                        (x) => x.reference === field.reference,
                                    )?.type ?? DimensionType.STRING
                                }
                                rightSection={
                                    field?.reference && (
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
                                                    actions.setYAxisAggregation(
                                                        {
                                                            index,
                                                            aggregation: value,
                                                        },
                                                    ),
                                                )
                                            }
                                        />
                                    )
                                }
                            />
                            <Tooltip
                                variant="xs"
                                label={t(
                                    'features_sql_runner_bar_chart_field_configuartaion.remove_y_axis',
                                )}
                            >
                                <ActionIcon
                                    color="gray.6"
                                    variant="subtle"
                                    onClick={() =>
                                        dispatch(
                                            actions.removeYAxisField(index),
                                        )
                                    }
                                >
                                    <MantineIcon icon={IconMinus} />
                                </ActionIcon>
                            </Tooltip>
                        </Group>
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
    columns,
    error,
}: {
    columns: VizColumn[];
    field: ReturnType<typeof cartesianChartSelectors.getXAxisField> | undefined;
    xLayoutOptions: VizIndexLayoutOptions[];
    actions: BarChartActionsType | LineChartActionsType;
    error: VizConfigErrors['indexFieldError'];
}) => {
    const { t } = useTranslation();
    const dispatch = useVizDispatch();

    return (
        <Group spacing="xs">
            <FieldReferenceSelect
                sx={{
                    flex: 1,
                }}
                data={xLayoutOptions.map((x) => ({
                    value: x.reference,
                    label: x.reference,
                }))}
                value={field?.reference ?? null}
                placeholder={t(
                    'features_sql_runner_bar_chart_field_configuartaion.select_x_axis',
                )}
                onChange={(value) =>
                    value && dispatch(actions.setXAxisReference(value))
                }
                error={
                    error &&
                    t(
                        'features_sql_runner_bar_chart_field_configuartaion.column_not_in_sql_query',
                        {
                            reference: error.reference || error,
                        },
                    )
                }
                fieldType={
                    (field?.reference &&
                        columns?.find((x) => x.reference === field.reference)
                            ?.type) ||
                    DimensionType.STRING
                }
                rightSection={
                    field?.reference && (
                        <DataVizSortConfig
                            sortBy={field.sortBy?.direction}
                            onChangeSortBy={(value) =>
                                field.reference &&
                                dispatch(
                                    actions.setSortBy({
                                        reference: field.reference,
                                        direction: value,
                                    }),
                                )
                            }
                        />
                    )
                }
            />
            <Tooltip
                variant="xs"
                label={t(
                    'features_sql_runner_bar_chart_field_configuartaion.remove_x_axis',
                )}
            >
                <ActionIcon
                    color="gray.6"
                    variant="subtle"
                    onClick={() => dispatch(actions.removeXAxisField())}
                    data-testid="remove-x-axis-field"
                >
                    <MantineIcon icon={IconMinus} />
                </ActionIcon>
            </Tooltip>
        </Group>
    );
};

const GroupByFieldAxisConfig = ({
    field,
    groupByOptions = [],
    actions,
    columns,
    error,
}: {
    columns: VizColumn[];
    field: undefined | { reference: string };
    groupByOptions?: VizPivotLayoutOptions[];
    actions: BarChartActionsType | LineChartActionsType;
    error: VizConfigErrors['groupByFieldError'];
}) => {
    const { t } = useTranslation();
    const dispatch = useVizDispatch();
    const groupByError = error?.references[0]
        ? t(
              'features_sql_runner_bar_chart_field_configuartaion.column_not_in_sql',
              {
                  reference: error.references[0],
              },
          )
        : undefined;
    return (
        <FieldReferenceSelect
            rightSection={
                // When the field is deleted, the error state prevents the clear button from showing
                groupByError && (
                    <ActionIcon
                        onClick={() =>
                            dispatch(actions.unsetGroupByReference())
                        }
                    >
                        <MantineIcon icon={IconX} />
                    </ActionIcon>
                )
            }
            clearable
            data={groupByOptions.map((groupBy) => ({
                value: groupBy.reference,
                label: groupBy.reference,
            }))}
            value={field?.reference ?? null}
            placeholder={t(
                'features_sql_runner_bar_chart_field_configuartaion.select_group_by',
            )}
            error={groupByError}
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
                columns?.find((x) => x.reference === field?.reference)?.type ??
                DimensionType.STRING
            }
        />
    );
};

export const CartesianChartFieldConfiguration = ({
    columns,
    actions,
    selectedChartType,
}: {
    selectedChartType: ChartKind;
    columns: VizColumn[];
    actions: BarChartActionsType | LineChartActionsType;
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

    const errors = useVizSelector((state) =>
        cartesianChartSelectors.getErrors(state, selectedChartType),
    );

    return (
        <Stack spacing="xl" mt="sm">
            <Config>
                <Config.Section>
                    <Config.Heading>
                        {t(
                            'features_sql_runner_bar_chart_field_configuartaion.x_axis',
                        )}
                    </Config.Heading>
                    {xLayoutOptions && (
                        <XFieldAxisConfig
                            columns={columns}
                            field={xAxisField}
                            xLayoutOptions={xLayoutOptions}
                            actions={actions}
                            error={errors?.indexFieldError}
                        />
                    )}
                </Config.Section>
            </Config>
            <Config>
                <Config.Section>
                    <Config.Group>
                        <Config.Heading>{`${t(
                            'features_sql_runner_bar_chart_field_configuartaion.y_axis',
                        )}`}</Config.Heading>
                        <Tooltip
                            variant="xs"
                            label={t(
                                'features_sql_runner_bar_chart_field_configuartaion.add_y_axis',
                            )}
                        >
                            <ActionIcon
                                color="gray.6"
                                variant="subtle"
                                onClick={() =>
                                    dispatch(actions.addYAxisField())
                                }
                                data-testid="add-y-axis-field"
                            >
                                <MantineIcon icon={IconPlus} />
                            </ActionIcon>
                        </Tooltip>
                    </Config.Group>
                    {yLayoutOptions &&
                        yAxisFields &&
                        yAxisFields.map((field, index) => (
                            <YFieldsAxisConfig
                                key={field.reference + index}
                                field={field}
                                yLayoutOptions={
                                    yLayoutOptions.customAggregations
                                }
                                isSingle={yAxisFields.length === 1}
                                index={index}
                                actions={actions}
                                columns={columns}
                                error={errors?.customMetricFieldError?.references.find(
                                    (reference: string) =>
                                        reference === field.reference,
                                )}
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
                        columns={columns}
                        field={groupByField}
                        groupByOptions={groupByLayoutOptions}
                        actions={actions}
                        error={errors?.groupByFieldError}
                    />
                </Config.Section>
            </Config>
        </Stack>
    );
};
