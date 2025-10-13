import { Box, SegmentedControl, Text, Tooltip } from '@mantine-8/core';
import { IconThumbDown, IconThumbUp } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';

import MantineIcon from '../../../../../components/common/MantineIcon';
import { type useAiAgentAdminFilters } from '../../hooks/useAiAgentAdminFilters';
import classes from './FeedbackFilter.module.css';

type FeedbackFilterProps = Pick<
    ReturnType<typeof useAiAgentAdminFilters>,
    'selectedFeedback' | 'setSelectedFeedback'
>;

export const FeedbackFilter = ({
    selectedFeedback,
    setSelectedFeedback,
}: FeedbackFilterProps) => {
    const { t } = useTranslation();

    const iconProps = {
        style: { display: 'block' },
        size: 18,
        stroke: 1.5,
    };
    const data = [
        {
            value: 'all',
            label: (
                <Tooltip
                    label={t(
                        'ai_agent_form_setup_admin.feedback_filter.show_all_threads',
                    )}
                    withinPortal
                >
                    <Box>
                        <Text fz="xs" fw={500}>
                            {t('ai_agent_form_setup_admin.feedback_filter.all')}
                        </Text>
                    </Box>
                </Tooltip>
            ),
        },
        {
            value: 'c',
            label: (
                <Tooltip
                    variant="xs"
                    label={t(
                        'ai_agent_form_setup_admin.feedback_filter.show_thumbs_up_threads',
                    )}
                    withinPortal
                    maw={200}
                >
                    <Box>
                        <MantineIcon icon={IconThumbUp} {...iconProps} />
                    </Box>
                </Tooltip>
            ),
        },
        {
            value: 'thumbs_down',
            label: (
                <Tooltip
                    variant="xs"
                    label={t(
                        'ai_agent_form_setup_admin.feedback_filter.show_thumbs_down_threads',
                    )}
                    withinPortal
                    maw={200}
                >
                    <Box pt="xxs">
                        <MantineIcon icon={IconThumbDown} {...iconProps} />
                    </Box>
                </Tooltip>
            ),
        },
    ];

    return (
        <SegmentedControl
            size="xs"
            radius="md"
            value={selectedFeedback}
            onChange={(value) =>
                setSelectedFeedback(
                    value as 'all' | 'thumbs_up' | 'thumbs_down',
                )
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
