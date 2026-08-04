import { Button } from '@mantine/core';
import { useClipboard } from '@mantine/hooks';
import { IconCheck, IconCopy } from '@tabler/icons-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import useToaster from '../../../../../hooks/toaster/useToaster';
import { prepareCustomVisSpecForClipboard } from '../../../../CustomVisualization/prepareCustomVisSpecForClipboard';
import { isCustomVisualizationConfig } from '../../../../LightdashVisualization/types';
import { useVisualizationContext } from '../../../../LightdashVisualization/useVisualizationContext';
import MantineIcon from '../../../../common/MantineIcon';

export const CopyCustomVisConfigButton = () => {
    const { t } = useTranslation();
    const clipboard = useClipboard({ timeout: 1200 });
    const { showToastSuccess } = useToaster();
    const { itemsMap, visualizationConfig } = useVisualizationContext();

    const customVisConfig = isCustomVisualizationConfig(visualizationConfig)
        ? visualizationConfig.chartConfig
        : undefined;

    const fieldIds = useMemo(
        () =>
            customVisConfig?.fields ??
            (customVisConfig?.series?.[0]
                ? Object.keys(customVisConfig.series[0])
                : []),
        [customVisConfig?.fields, customVisConfig?.series],
    );

    const specToCopy = useMemo(() => {
        const resolvedSpec = prepareCustomVisSpecForClipboard(
            customVisConfig?.visSpec,
            customVisConfig?.editorResponsiveTab ?? 'desktop',
            itemsMap,
            fieldIds,
            customVisConfig?.series,
        );

        return resolvedSpec ? JSON.stringify(resolvedSpec, null, 2) : '';
    }, [
        customVisConfig?.editorResponsiveTab,
        customVisConfig?.visSpec,
        customVisConfig?.series,
        fieldIds,
        itemsMap,
    ]);

    if (!customVisConfig) return null;

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
            disabled={!specToCopy}
            onClick={() => {
                clipboard.copy(specToCopy);
                showToastSuccess({
                    title: t(
                        'components_visualization_configs_custom_vis.copied',
                    ),
                });
            }}
            data-testid="copy-custom-vis-config"
        >
            {clipboard.copied
                ? t('components_visualization_configs_custom_vis.copied')
                : t('components_visualization_configs_custom_vis.copy_config')}
        </Button>
    );
};
