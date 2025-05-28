import {
    type ItemsMap,
    sortedItemsForXAxis,
    sortedItemsForYAxis,
} from '@lightdash/common';
import { Button, Menu } from '@mantine/core';
import {
    IconChartBar,
    IconChartBubble,
    IconFilter,
    IconFlame,
    IconStairs,
    IconWorld,
} from '@tabler/icons-react';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { COLLAPSABLE_CARD_POPOVER_PROPS } from '../../../../common/CollapsableCard/constants';
import MantineIcon from '../../../../common/MantineIcon';
import { generateVegaTemplate } from '../utils/templates';
import { TemplateType } from '../utils/vegaTemplates';

const getTemplateIcon = (template: TemplateType) => {
    switch (template) {
        case TemplateType.BAR_CHART:
            return IconChartBar;
        case TemplateType.HEATMAP:
            return IconFlame;
        case TemplateType.BUBBLE_PLOTS:
            return IconChartBubble;
        case TemplateType.FUNNEL_CHART:
            return IconFilter;
        case TemplateType.WATERFALL_CHART:
            return IconStairs;
        case TemplateType.MAP:
            return IconWorld;
    }

    return IconChartBar;
};
export const SelectTemplate = ({
    itemsMap,
    isCustomConfig,
    setEditorConfig,
}: {
    itemsMap: ItemsMap | undefined;
    isCustomConfig: boolean;
    isEditorEmpty: boolean;
    setEditorConfig: (config: string) => void;
}) => {
    const { t } = useTranslation();

    const loadTemplate = useCallback(
        (template: TemplateType) => {
            if (!isCustomConfig) return null;

            const xField = sortedItemsForXAxis(itemsMap)[0];
            const [yField, extraField] = sortedItemsForYAxis(itemsMap);

            const templateString = generateVegaTemplate(
                template,
                xField,
                yField,
                extraField,
            );
            setEditorConfig(templateString);
        },
        [isCustomConfig, itemsMap, setEditorConfig],
    );

    return (
        <Menu {...COLLAPSABLE_CARD_POPOVER_PROPS} width={183} closeOnItemClick>
            <Menu.Dropdown>
                {Object.values(TemplateType).map((template) => (
                    <Menu.Item
                        key={template}
                        onClick={() => loadTemplate(template)}
                        icon={<MantineIcon icon={getTemplateIcon(template)} />}
                    >
                        {template}
                    </Menu.Item>
                ))}
                <Menu.Divider />
                <Menu.Label>
                    {t(
                        'components_visualization_configs_custom_vis_template.selecting_new_template_will_reset_the_config',
                    )}
                </Menu.Label>
            </Menu.Dropdown>
            <Menu.Target>
                <Button
                    size="sm"
                    variant="subtle"
                    compact
                    leftIcon="+"
                    styles={{
                        leftIcon: {
                            marginRight: 2,
                        },
                    }}
                >
                    {t(
                        'components_visualization_configs_custom_vis_template.insert_template',
                    )}
                </Button>
            </Menu.Target>
        </Menu>
    );
};
