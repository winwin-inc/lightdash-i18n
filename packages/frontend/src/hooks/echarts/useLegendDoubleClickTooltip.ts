import { px, useMantineTheme } from '@mantine/core';
import { useTranslation } from 'react-i18next';

export const useLegendDoubleClickTooltip = () => {
    const theme = useMantineTheme();
    const { t } = useTranslation();

    return {
        tooltip: {
            show: true,
            borderColor: theme.colors.gray[2],
            borderWidth: 1,
            textStyle: {
                color: theme.colors.gray[6],
                fontSize: 12,
                fontWeight: 400,
            },
            padding: [px(theme.spacing.two), px(theme.spacing.xxs)],
            extraCssText: `box-shadow: ${theme.shadows.subtle};`,
            formatter: () => {
                return t(
                    'components_visualization_configs_chart.legend.interaction_hint',
                );
            },
        },
    };
};
