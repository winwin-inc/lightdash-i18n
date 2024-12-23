import {
    MAX_SEGMENT_DIMENSION_UNIQUE_VALUES,
    MetricExplorerComparison,
    type MetricExplorerQuery,
} from '@lightdash/common';
import {
    Alert,
    Box,
    Button,
    Group,
    Loader,
    Select,
    Stack,
    Text,
    Tooltip,
} from '@mantine/core';
import { IconInfoCircle, IconX } from '@tabler/icons-react';
import { type UseQueryResult } from '@tanstack/react-query';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';

import MantineIcon from '../../../../components/common/MantineIcon';
import { Blocks } from '../../../../svgs/metricsCatalog';
import { useSelectStyles } from '../../styles/useSelectStyles';
import SelectItem from '../SelectItem';

type Props = {
    query: MetricExplorerQuery;
    onSegmentDimensionChange: (value: string | null) => void;
    segmentByData: Array<{ value: string; label: string }>;
    segmentDimensionsQuery: UseQueryResult;
    hasFilteredSeries: boolean;
};

export const MetricPeekSegmentationPicker: FC<Props> = ({
    query,
    onSegmentDimensionChange,
    segmentByData,
    segmentDimensionsQuery,
    hasFilteredSeries,
}) => {
    const { t } = useTranslation();
    const { classes } = useSelectStyles();

    return (
        <Stack spacing="xs">
            <Group position="apart">
                <Text fw={500} c="gray.7">
                    {t(
                        'features_metrics_catalog_components.metric_peek_segmentation_picker.segment',
                    )}
                </Text>

                <Button
                    variant="subtle"
                    compact
                    color="dark"
                    size="xs"
                    radius="md"
                    rightIcon={
                        <MantineIcon icon={IconX} color="gray.5" size={12} />
                    }
                    sx={(theme) => ({
                        visibility:
                            !('segmentDimension' in query) ||
                            !query.segmentDimension
                                ? 'hidden'
                                : 'visible',
                        '&:hover': {
                            backgroundColor: theme.colors.gray[1],
                        },
                    })}
                    styles={{
                        rightIcon: {
                            marginLeft: 4,
                        },
                    }}
                    onClick={() => onSegmentDimensionChange(null)}
                >
                    {t(
                        'features_metrics_catalog_components.metric_peek_segmentation_picker.clear',
                    )}
                </Button>
            </Group>

            <Tooltip
                label={t(
                    'features_metrics_catalog_components.metric_peek_segmentation_picker.tooltip.label',
                )}
                disabled={segmentByData.length > 0}
                position="right"
            >
                <Box>
                    <Select
                        placeholder={t(
                            'features_metrics_catalog_components.metric_peek_segmentation_picker.tooltip.placeholder',
                        )}
                        icon={<Blocks />}
                        searchable
                        radius="md"
                        size="xs"
                        data={segmentByData}
                        disabled={segmentByData.length === 0}
                        value={
                            query.comparison === MetricExplorerComparison.NONE
                                ? query.segmentDimension
                                : null
                        }
                        itemComponent={SelectItem}
                        onChange={onSegmentDimensionChange}
                        data-disabled={!segmentDimensionsQuery.isSuccess}
                        rightSection={
                            segmentDimensionsQuery.isLoading ? (
                                <Loader size="xs" color="gray.5" />
                            ) : undefined
                        }
                        classNames={classes}
                        sx={{
                            '&:hover': {
                                cursor: 'not-allowed',
                            },
                        }}
                    />
                </Box>
            </Tooltip>

            {hasFilteredSeries && (
                <Alert
                    py="xs"
                    px="sm"
                    variant="light"
                    color="blue"
                    sx={(theme) => ({
                        borderStyle: 'dashed',
                        borderWidth: 1,
                        borderColor: theme.colors.blue[4],
                    })}
                    styles={{
                        icon: {
                            marginRight: 2,
                        },
                    }}
                    icon={
                        <MantineIcon
                            icon={IconInfoCircle}
                            color="blue.7"
                            size={16}
                        />
                    }
                >
                    <Text size="xs" color="blue.7" span>
                        {t(
                            'features_metrics_catalog_components.metric_peek_segmentation_picker.tooltip.content',
                            { MAX_SEGMENT_DIMENSION_UNIQUE_VALUES },
                        )}
                    </Text>
                </Alert>
            )}
        </Stack>
    );
};
