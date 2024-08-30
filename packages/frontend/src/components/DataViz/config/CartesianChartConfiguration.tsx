import { ChartKind, type VizSqlColumn } from '@lightdash/common';
import { ActionIcon, Divider, Group, Stack, Title } from '@mantine/core';
import { IconChevronDown, IconChevronRight } from '@tabler/icons-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import MantineIcon from '../../common/MantineIcon';
import { barChartConfigSlice } from '../store/barChartSlice';
import { lineChartConfigSlice } from '../store/lineChartSlice';
import { CartesianChartFieldConfiguration } from './CartesianChartFieldConfiguration';
import { CartesianChartStyling } from './CartesianChartStyling';

export const CartesianChartConfig = ({
    selectedChartType,
    sqlColumns,
}: {
    selectedChartType: ChartKind;
    sqlColumns: VizSqlColumn[];
}) => {
    const { t } = useTranslation();

    const [isFieldConfigurationOpen, setIsFieldConfigurationOpen] =
        useState(true);
    const [isStylingOpen, setIsStylingOpen] = useState(false);

    const actions =
        selectedChartType === ChartKind.LINE
            ? lineChartConfigSlice.actions
            : selectedChartType === ChartKind.VERTICAL_BAR
            ? barChartConfigSlice.actions
            : null;

    if (!actions) {
        return null;
    }

    return (
        <Stack spacing="xs" mb="lg">
            <Group spacing="xs">
                <Title order={5} fz="sm" c="gray.9">
                    {t('features_sql_runner_bar_chart_configuration.data')}
                </Title>
                <ActionIcon>
                    <MantineIcon
                        onClick={() =>
                            setIsFieldConfigurationOpen(
                                !isFieldConfigurationOpen,
                            )
                        }
                        icon={
                            isFieldConfigurationOpen
                                ? IconChevronDown
                                : IconChevronRight
                        }
                    />
                </ActionIcon>
            </Group>

            {isFieldConfigurationOpen && (
                <CartesianChartFieldConfiguration
                    actions={actions}
                    sqlColumns={sqlColumns}
                    selectedChartType={selectedChartType}
                />
            )}

            <Divider my="sm" />

            <Group spacing="xs">
                <Title order={5} fz="sm" c="gray.9">
                    {t('features_sql_runner_bar_chart_configuration.styling')}
                </Title>
                <ActionIcon>
                    <MantineIcon
                        onClick={() => setIsStylingOpen(!isStylingOpen)}
                        icon={
                            isStylingOpen ? IconChevronDown : IconChevronRight
                        }
                    />
                </ActionIcon>
            </Group>

            {isStylingOpen && (
                <CartesianChartStyling
                    actions={actions}
                    selectedChartType={selectedChartType}
                />
            )}
        </Stack>
    );
};
