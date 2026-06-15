import { subject } from '@casl/ability';
import {
    ChartType,
    getCustomLabelsFromColumnProperties,
    getHiddenTableFields,
    getPivotConfig,
    isField,
    type ApiScheduledDownloadCsv,
    type ChartConfig,
} from '@lightdash/common';
import { ActionIcon, Popover } from '@mantine/core';
import { IconShare2 } from '@tabler/icons-react';
import { memo, useCallback } from 'react';
import useEchartsCartesianConfig from '../../../hooks/echarts/useEchartsCartesianConfig';
import { Can } from '../../../providers/Ability';
import useApp from '../../../providers/App/useApp';
import ExportSelector from '../../ExportSelector';
import { isTableVisualizationConfig } from '../../LightdashVisualization/types';
import { useVisualizationContext } from '../../LightdashVisualization/useVisualizationContext';
import {
    COLLAPSABLE_CARD_ACTION_ICON_PROPS,
    COLLAPSABLE_CARD_POPOVER_PROPS,
} from '../CollapsableCard/constants';
import MantineIcon from '../MantineIcon';
import ChartDownloadOptions from './ChartDownloadOptions';

export type ChartDownloadMenuProps = {
    getDownloadQueryUuid: (
        limit: number | null,
        exportPivotedResults: boolean,
    ) => Promise<string>;
    projectUuid: string;
    chartName?: string;
    getGsheetLink?: (
        columnOrder: string[],
        showTableNames: boolean,
        customLabels?: Record<string, string>,
        hiddenFields?: string[],
        pivotConfig?: ReturnType<typeof getPivotConfig>,
    ) => Promise<ApiScheduledDownloadCsv>;
};

const ChartDownloadMenu: React.FC<ChartDownloadMenuProps> = memo(
    ({ getDownloadQueryUuid, getGsheetLink, projectUuid, chartName }) => {
        const {
            chartRef,
            visualizationConfig,
            resultsData,
            pivotDimensions,
            chartConfig,
            columnOrder,
            itemsMap,
        } = useVisualizationContext();

        const eChartsOptions = useEchartsCartesianConfig();

        const disabled =
            (isTableVisualizationConfig(visualizationConfig) &&
                !resultsData?.totalResults) ||
            (visualizationConfig.chartType === ChartType.CARTESIAN &&
                !eChartsOptions);

        const { user } = useApp();

        const getChartInstance = useCallback(
            () => chartRef.current?.getEchartsInstance(),
            [chartRef],
        );

        const exportChartConfig: ChartConfig = isTableVisualizationConfig(
            visualizationConfig,
        )
            ? {
                  type: ChartType.TABLE,
                  config: visualizationConfig.chartConfig.validConfig,
              }
            : chartConfig;

        const exportColumnOrder = isTableVisualizationConfig(
            visualizationConfig,
        )
            ? visualizationConfig.chartConfig.columnOrder
            : columnOrder;

        const exportHiddenFields = getHiddenTableFields(exportChartConfig);
        const exportShowTableNames = isTableVisualizationConfig(
            visualizationConfig,
        )
            ? visualizationConfig.chartConfig.showTableNames
            : false;
        const exportCustomLabels = isTableVisualizationConfig(
            visualizationConfig,
        )
            ? Object.fromEntries(
                  Object.entries(
                      getCustomLabelsFromColumnProperties(
                          visualizationConfig.chartConfig.columnProperties,
                      ) ?? {},
                  ).map(([fieldId, label]) => {
                      const item = itemsMap?.[fieldId];
                      const tableNamePrefix =
                          isField(item) && exportShowTableNames
                              ? `${item.tableLabel} `
                              : '';

                      return [
                          fieldId,
                          tableNamePrefix && !label.startsWith(tableNamePrefix)
                              ? `${tableNamePrefix}${label}`
                              : label,
                      ];
                  }),
              )
            : undefined;

        // Build pivot config with the current preview config and pivot dimensions.
        const exportPivotConfig = getPivotConfig({
            chartConfig: exportChartConfig,
            pivotConfig: pivotDimensions
                ? {
                      columns: pivotDimensions,
                  }
                : undefined,
            tableConfig: {
                columnOrder: exportColumnOrder,
            },
        });

        // ChartDownloadMenu downloads pivoted results when they are available
        const getChartDownloadQueryUuid = useCallback(
            (limit: number | null) => {
                return getDownloadQueryUuid(limit, true);
            },
            [getDownloadQueryUuid],
        );

        return isTableVisualizationConfig(visualizationConfig) &&
            getChartDownloadQueryUuid ? (
            <Can
                I="manage"
                this={subject('ExportCsv', {
                    organizationUuid: user.data?.organizationUuid,
                    projectUuid,
                })}
            >
                <Popover
                    {...COLLAPSABLE_CARD_POPOVER_PROPS}
                    disabled={disabled}
                    position="bottom-end"
                >
                    <Popover.Target>
                        <ActionIcon
                            data-testid="export-csv-button"
                            {...COLLAPSABLE_CARD_ACTION_ICON_PROPS}
                            disabled={disabled}
                        >
                            <MantineIcon icon={IconShare2} color="gray" />
                        </ActionIcon>
                    </Popover.Target>

                    <Popover.Dropdown>
                        <ExportSelector
                            projectUuid={projectUuid}
                            totalResults={resultsData?.totalResults}
                            getDownloadQueryUuid={getChartDownloadQueryUuid}
                            columnOrder={exportColumnOrder}
                            customLabels={exportCustomLabels}
                            hiddenFields={exportHiddenFields}
                            showTableNames={exportShowTableNames}
                            chartName={chartName}
                            pivotConfig={exportPivotConfig}
                            getGsheetLink={
                                getGsheetLink === undefined
                                    ? undefined
                                    : () =>
                                          getGsheetLink(
                                              exportColumnOrder,
                                              exportShowTableNames,
                                              exportCustomLabels,
                                              exportHiddenFields,
                                              exportPivotConfig,
                                          )
                            }
                        />
                    </Popover.Dropdown>
                </Popover>
            </Can>
        ) : isTableVisualizationConfig(visualizationConfig) &&
          !getDownloadQueryUuid ? null : (
            <Popover
                {...COLLAPSABLE_CARD_POPOVER_PROPS}
                disabled={disabled}
                position="bottom-end"
            >
                <Popover.Target>
                    <ActionIcon
                        data-testid="export-csv-button"
                        {...COLLAPSABLE_CARD_ACTION_ICON_PROPS}
                        disabled={disabled}
                    >
                        <MantineIcon icon={IconShare2} />
                    </ActionIcon>
                </Popover.Target>

                <Popover.Dropdown>
                    {visualizationConfig?.chartType &&
                    !isTableVisualizationConfig(visualizationConfig) &&
                    chartRef.current ? (
                        <ChartDownloadOptions
                            getChartInstance={getChartInstance}
                        />
                    ) : null}
                </Popover.Dropdown>
            </Popover>
        );
    },
);

export default ChartDownloadMenu;
