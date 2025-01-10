import { Box, Button, Popover } from '@mantine/core';
import { IconChevronDown } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';

import {
    COLLAPSABLE_CARD_BUTTON_PROPS,
    COLLAPSABLE_CARD_POPOVER_PROPS,
} from '../../common/CollapsableCard/constants';
import MantineIcon from '../../common/MantineIcon';
import { isCartesianVisualizationConfig } from '../../LightdashVisualization/types';
import { useVisualizationContext } from '../../LightdashVisualization/useVisualizationContext';
import { ConfigTabs } from './ConfigTabs';

const ChartConfigPanel: React.FC = () => {
    const { t } = useTranslation();

    const { resultsData, visualizationConfig } = useVisualizationContext();

    if (!isCartesianVisualizationConfig(visualizationConfig)) return null;

    const { chartConfig } = visualizationConfig;

    const disabled =
        !resultsData ||
        resultsData?.rows.length === 0 ||
        !chartConfig.validConfig;

    return (
        <Popover
            withinPortal={true}
            {...COLLAPSABLE_CARD_POPOVER_PROPS}
            disabled={disabled}
        >
            <Popover.Target>
                <Button
                    {...COLLAPSABLE_CARD_BUTTON_PROPS}
                    disabled={disabled}
                    rightIcon={
                        <MantineIcon icon={IconChevronDown} color="gray" />
                    }
                >
                    {t('components_visualization_configs_chart.configure')}
                </Button>
            </Popover.Target>

            <Popover.Dropdown>
                <Box w={335}>
                    <ConfigTabs />
                </Box>
            </Popover.Dropdown>
        </Popover>
    );
};

export default ChartConfigPanel;
