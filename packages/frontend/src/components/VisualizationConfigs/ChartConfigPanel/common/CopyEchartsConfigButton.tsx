import { Button } from '@mantine/core';
import { useClipboard } from '@mantine/hooks';
import { IconCheck, IconCopy } from '@tabler/icons-react';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';

import useToaster from '../../../../hooks/toaster/useToaster';
import { useVisualizationContext } from '../../../LightdashVisualization/useVisualizationContext';
import MantineIcon from '../../../common/MantineIcon';
import { prepareEchartsOptionForClipboard } from './prepareEchartsOptionForClipboard';

/**
 * Copy the current ECharts option of a built-in (echarts-based) chart to the
 * clipboard. The full merged option returned by `getOption()` is useful for
 * debugging and for replaying the chart in an external ECharts playground.
 */
export const CopyEchartsConfigButton: FC = () => {
    const { t } = useTranslation();
    const clipboard = useClipboard({ timeout: 1200 });
    const { showToastSuccess } = useToaster();
    const { chartRef } = useVisualizationContext();

    const handleCopy = () => {
        const instance = chartRef.current?.getEchartsInstance();
        if (!instance) return;
        const option = instance.getOption();
        const json = JSON.stringify(
            prepareEchartsOptionForClipboard(option as Record<string, unknown>),
            null,
            2,
        );
        clipboard.copy(json);
        showToastSuccess({
            title: t('components_visualization_configs_common.copied'),
        });
    };

    return (
        <Button
            variant="default"
            size="sm"
            compact
            fz="xs"
            px="sm"
            leftIcon={
                <MantineIcon icon={clipboard.copied ? IconCheck : IconCopy} />
            }
            onClick={handleCopy}
            data-testid="copy-echarts-config"
        >
            {clipboard.copied
                ? t('components_visualization_configs_common.copied')
                : t('components_visualization_configs_common.copy_config')}
        </Button>
    );
};
