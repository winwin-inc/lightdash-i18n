import {
    assertUnreachable,
    CartesianSeriesType,
    ChartType,
    isSeriesWithMixedChartTypes,
} from '@lightdash/common';
import { Button, Menu } from '@mantine/core';
import {
    IconChartArea,
    IconChartAreaLine,
    IconChartBar,
    IconChartDots,
    IconChartLine,
    IconChartPie,
    IconChevronDown,
    IconCode,
    IconFilter,
    IconSquareNumber1,
    IconTable,
} from '@tabler/icons-react';
import { memo, useMemo, type FC, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import {
    COLLAPSABLE_CARD_BUTTON_PROPS,
    COLLAPSABLE_CARD_POPOVER_PROPS,
} from '../../common/CollapsableCard/constants';
import MantineIcon from '../../common/MantineIcon';
import {
    isBigNumberVisualizationConfig,
    isCartesianVisualizationConfig,
    isCustomVisualizationConfig,
    isFunnelVisualizationConfig,
    isPieVisualizationConfig,
    isTableVisualizationConfig,
} from '../../LightdashVisualization/types';
import { useVisualizationContext } from '../../LightdashVisualization/useVisualizationContext';

const VisualizationCardOptions: FC = memo(() => {
    const { t } = useTranslation();

    const {
        visualizationConfig,
        setChartType,
        setCartesianType,
        setStacking,
        isLoading,
        resultsData,
        setPivotDimensions,
        pivotDimensions,
    } = useVisualizationContext();
    const disabled = isLoading || !resultsData || resultsData.rows.length <= 0;

    const cartesianConfig = useMemo(() => {
        if (isCartesianVisualizationConfig(visualizationConfig)) {
            return visualizationConfig.chartConfig;
        }
        return undefined;
    }, [visualizationConfig]);

    const cartesianType = cartesianConfig?.dirtyChartType;

    const cartesianFlipAxis = cartesianConfig?.dirtyLayout?.flipAxes;
    const isChartTypeTheSameForAllSeries = cartesianConfig
        ? !isSeriesWithMixedChartTypes(
              cartesianConfig.dirtyEchartsConfig?.series,
          )
        : undefined;

    const selectedChartType = useMemo<{
        text: string;
        icon: ReactNode;
    }>(() => {
        switch (visualizationConfig.chartType) {
            case ChartType.CARTESIAN: {
                if (!isChartTypeTheSameForAllSeries) {
                    return {
                        text: t(
                            'components_explorer_visualization_card_options.chart_types.mixed',
                        ),
                        icon: (
                            <MantineIcon
                                icon={IconChartAreaLine}
                                color="gray"
                            />
                        ),
                    };
                }

                const cartesianChartType =
                    visualizationConfig.chartConfig.dirtyChartType;

                switch (cartesianChartType) {
                    case CartesianSeriesType.AREA:
                        return {
                            text: t(
                                'components_explorer_visualization_card_options.chart_types.area_chart',
                            ),
                            icon: (
                                <MantineIcon
                                    icon={IconChartArea}
                                    color="gray"
                                />
                            ),
                        };
                    case CartesianSeriesType.LINE:
                        return {
                            text: t(
                                'components_explorer_visualization_card_options.chart_types.line_chart',
                            ),
                            icon: (
                                <MantineIcon
                                    icon={IconChartLine}
                                    color="gray"
                                />
                            ),
                        };

                    case CartesianSeriesType.BAR:
                        return cartesianFlipAxis
                            ? {
                                  text: t(
                                      'components_explorer_visualization_card_options.chart_types.horizontal_bar_chart',
                                  ),
                                  icon: (
                                      <MantineIcon
                                          icon={IconChartBar}
                                          style={{ rotate: '90deg' }}
                                          color="gray"
                                      />
                                  ),
                              }
                            : {
                                  text: t(
                                      'components_explorer_visualization_card_options.chart_types.bar_chart',
                                  ),
                                  icon: (
                                      <MantineIcon
                                          icon={IconChartBar}
                                          color="gray"
                                      />
                                  ),
                              };
                    case CartesianSeriesType.SCATTER:
                        return {
                            text: t(
                                'components_explorer_visualization_card_options.chart_types.scatter_chart',
                            ),
                            icon: (
                                <MantineIcon
                                    icon={IconChartDots}
                                    color="gray"
                                />
                            ),
                        };
                    default:
                        return assertUnreachable(
                            cartesianChartType,
                            `Unknown cartesian type ${cartesianChartType}`,
                        );
                }
            }
            case ChartType.TABLE:
                return {
                    text: t(
                        'components_explorer_visualization_card_options.chart_types.table',
                    ),
                    icon: <MantineIcon icon={IconTable} color="gray" />,
                };
            case ChartType.BIG_NUMBER:
                return {
                    text: t(
                        'components_explorer_visualization_card_options.chart_types.big_value',
                    ),
                    icon: <MantineIcon icon={IconSquareNumber1} color="gray" />,
                };
            case ChartType.PIE:
                return {
                    text: t(
                        'components_explorer_visualization_card_options.chart_types.pie_chart',
                    ),
                    icon: <MantineIcon icon={IconChartPie} color="gray" />,
                };
            case ChartType.FUNNEL:
                return {
                    text: t(
                        'components_explorer_visualization_card_options.chart_types.funnel_chart',
                    ),
                    icon: <MantineIcon icon={IconFilter} color="gray" />,
                };
            case ChartType.CUSTOM:
                return {
                    text: t(
                        'components_explorer_visualization_card_options.chart_types.custom',
                    ),
                    icon: <MantineIcon icon={IconCode} color="gray" />,
                };
            default: {
                return assertUnreachable(
                    visualizationConfig,
                    `Unknown visualization chart type`,
                );
            }
        }
    }, [
        visualizationConfig,
        isChartTypeTheSameForAllSeries,
        cartesianFlipAxis,
        t,
    ]);

    return (
        <Menu
            {...COLLAPSABLE_CARD_POPOVER_PROPS}
            closeOnItemClick
            disabled={disabled}
        >
            <Menu.Target>
                <Button
                    {...COLLAPSABLE_CARD_BUTTON_PROPS}
                    disabled={disabled}
                    leftIcon={selectedChartType.icon}
                    rightIcon={
                        <MantineIcon icon={IconChevronDown} color="gray" />
                    }
                    data-testid="VisualizationCardOptions"
                >
                    {selectedChartType.text}
                </Button>
            </Menu.Target>

            <Menu.Dropdown>
                <Menu.Item
                    disabled={disabled}
                    color={
                        isChartTypeTheSameForAllSeries &&
                        isCartesianVisualizationConfig(visualizationConfig) &&
                        cartesianType === CartesianSeriesType.BAR &&
                        !cartesianFlipAxis
                            ? 'blue'
                            : undefined
                    }
                    icon={<MantineIcon icon={IconChartBar} />}
                    onClick={() => {
                        setCartesianType({
                            type: CartesianSeriesType.BAR,
                            flipAxes: false,
                            hasAreaStyle: false,
                        });
                        setChartType(ChartType.CARTESIAN);
                    }}
                >
                    {t(
                        'components_explorer_visualization_card_options.menus.bar_chart',
                    )}
                </Menu.Item>
                <Menu.Item
                    disabled={disabled}
                    color={
                        isChartTypeTheSameForAllSeries &&
                        isCartesianVisualizationConfig(visualizationConfig) &&
                        cartesianType === CartesianSeriesType.BAR &&
                        cartesianFlipAxis
                            ? 'blue'
                            : undefined
                    }
                    icon={
                        <MantineIcon
                            icon={IconChartBar}
                            style={{ rotate: '90deg' }}
                        />
                    }
                    onClick={() => {
                        setCartesianType({
                            type: CartesianSeriesType.BAR,
                            flipAxes: true,
                            hasAreaStyle: false,
                        });
                        if (!pivotDimensions) setStacking(false);
                        setChartType(ChartType.CARTESIAN);
                    }}
                >
                    {t(
                        'components_explorer_visualization_card_options.menus.horizontal_bar_chart',
                    )}
                </Menu.Item>
                <Menu.Item
                    disabled={disabled}
                    color={
                        isChartTypeTheSameForAllSeries &&
                        isCartesianVisualizationConfig(visualizationConfig) &&
                        cartesianType === CartesianSeriesType.LINE
                            ? 'blue'
                            : undefined
                    }
                    icon={<MantineIcon icon={IconChartLine} />}
                    onClick={() => {
                        setCartesianType({
                            type: CartesianSeriesType.LINE,
                            flipAxes: false,
                            hasAreaStyle: false,
                        });
                        setStacking(false);
                        setChartType(ChartType.CARTESIAN);
                    }}
                >
                    {t(
                        'components_explorer_visualization_card_options.menus.line_chart',
                    )}
                </Menu.Item>
                <Menu.Item
                    disabled={disabled}
                    color={
                        isChartTypeTheSameForAllSeries &&
                        isCartesianVisualizationConfig(visualizationConfig) &&
                        cartesianType === CartesianSeriesType.AREA
                            ? 'blue'
                            : undefined
                    }
                    icon={<MantineIcon icon={IconChartArea} />}
                    onClick={() => {
                        setCartesianType({
                            type: CartesianSeriesType.LINE,
                            flipAxes: false,
                            hasAreaStyle: true,
                        });
                        setStacking(true);
                        setChartType(ChartType.CARTESIAN);
                    }}
                >
                    {t(
                        'components_explorer_visualization_card_options.menus.area_chart',
                    )}
                </Menu.Item>
                <Menu.Item
                    disabled={disabled}
                    color={
                        isChartTypeTheSameForAllSeries &&
                        isCartesianVisualizationConfig(visualizationConfig) &&
                        cartesianType === CartesianSeriesType.SCATTER
                            ? 'blue'
                            : undefined
                    }
                    icon={<MantineIcon icon={IconChartDots} />}
                    onClick={() => {
                        setCartesianType({
                            type: CartesianSeriesType.SCATTER,
                            flipAxes: false,
                            hasAreaStyle: false,
                        });
                        setStacking(false);
                        setChartType(ChartType.CARTESIAN);
                    }}
                >
                    {t(
                        'components_explorer_visualization_card_options.menus.scatter_chart',
                    )}
                </Menu.Item>

                <Menu.Item
                    disabled={disabled}
                    color={
                        isPieVisualizationConfig(visualizationConfig)
                            ? 'blue'
                            : undefined
                    }
                    icon={<MantineIcon icon={IconChartPie} />}
                    onClick={() => {
                        setPivotDimensions(undefined);
                        setStacking(undefined);
                        setCartesianType(undefined);
                        setChartType(ChartType.PIE);
                    }}
                >
                    {t(
                        'components_explorer_visualization_card_options.menus.pie_chart',
                    )}
                </Menu.Item>

                <Menu.Item
                    disabled={disabled}
                    color={
                        isFunnelVisualizationConfig(visualizationConfig)
                            ? 'blue'
                            : undefined
                    }
                    icon={<MantineIcon icon={IconFilter} />}
                    onClick={() => {
                        setPivotDimensions(undefined);
                        setStacking(undefined);
                        setCartesianType(undefined);
                        setChartType(ChartType.FUNNEL);
                    }}
                >
                    {t(
                        'components_explorer_visualization_card_options.menus.funnel_chart',
                    )}
                </Menu.Item>

                <Menu.Item
                    disabled={disabled}
                    color={
                        isTableVisualizationConfig(visualizationConfig)
                            ? 'blue'
                            : undefined
                    }
                    icon={<MantineIcon icon={IconTable} />}
                    onClick={() => {
                        setPivotDimensions(undefined);
                        setStacking(undefined);
                        setCartesianType(undefined);
                        setChartType(ChartType.TABLE);
                    }}
                >
                    {t(
                        'components_explorer_visualization_card_options.menus.table',
                    )}
                </Menu.Item>
                <Menu.Item
                    disabled={disabled}
                    color={
                        isBigNumberVisualizationConfig(visualizationConfig)
                            ? 'blue'
                            : undefined
                    }
                    icon={<MantineIcon icon={IconSquareNumber1} />}
                    onClick={() => {
                        setPivotDimensions(undefined);
                        setStacking(undefined);
                        setCartesianType(undefined);
                        setChartType(ChartType.BIG_NUMBER);
                    }}
                >
                    {t(
                        'components_explorer_visualization_card_options.menus.big_value',
                    )}
                </Menu.Item>

                <Menu.Item
                    disabled={disabled}
                    color={
                        isCustomVisualizationConfig(visualizationConfig)
                            ? 'blue'
                            : undefined
                    }
                    icon={<MantineIcon icon={IconCode} />}
                    onClick={() => {
                        setPivotDimensions(undefined);
                        setStacking(undefined);
                        setCartesianType(undefined);
                        setChartType(ChartType.CUSTOM);
                    }}
                >
                    Custom
                </Menu.Item>
            </Menu.Dropdown>
        </Menu>
    );
});

export default VisualizationCardOptions;
