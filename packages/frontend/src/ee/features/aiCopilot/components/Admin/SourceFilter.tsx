import { Box, SegmentedControl, Text, Tooltip } from '@mantine-8/core';
import { IconBrandSlack, IconMessageCircleStar } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';

import MantineIcon from '../../../../../components/common/MantineIcon';
import { type useAiAgentAdminFilters } from '../../hooks/useAiAgentAdminFilters';
import classes from './SourceFilter.module.css';

type SourceFilterProps = Pick<
    ReturnType<typeof useAiAgentAdminFilters>,
    'selectedSource' | 'setSelectedSource'
>;

export const SourceFilter = ({
    selectedSource,
    setSelectedSource,
}: SourceFilterProps) => {
    const { t } = useTranslation();

    const iconProps = {
        style: { display: 'block' },
        size: 18,
        stroke: 1.5,
    };
    const data = [
        {
            label: (
                <Tooltip
                    withinPortal
                    variant="xs"
                    label={t(
                        'ai_agent_form_setup_admin.source_filter.all_sources',
                    )}
                >
                    <Box>
                        <Text fz="xs" fw={500}>
                            {t('ai_agent_form_setup_admin.source_filter.all')}
                        </Text>
                    </Box>
                </Tooltip>
            ),
            value: 'all',
        },
        {
            label: (
                <Tooltip
                    withinPortal
                    variant="xs"
                    label={t('ai_agent_form_setup_admin.source_filter.web_app')}
                >
                    <Box>
                        <MantineIcon
                            icon={IconMessageCircleStar}
                            {...iconProps}
                        />
                    </Box>
                </Tooltip>
            ),
            value: 'web_app',
        },
        {
            label: (
                <Tooltip
                    withinPortal
                    variant="xs"
                    label={t('ai_agent_form_setup_admin.source_filter.slack')}
                >
                    <Box>
                        <MantineIcon icon={IconBrandSlack} {...iconProps} />
                    </Box>
                </Tooltip>
            ),
            value: 'slack',
        },
    ];
    return (
        <SegmentedControl
            size="xs"
            value={selectedSource}
            onChange={(value) =>
                setSelectedSource(value as 'all' | 'web_app' | 'slack')
            }
            classNames={{
                root: classes.segmentedControl,
                indicator: classes.indicator,
                label: classes.label,
            }}
            data={data}
        />
    );
};
