import { Group, HoverCard, Stack, Text, Tooltip } from '@mantine/core';
import { IconEye, IconInfoCircle } from '@tabler/icons-react';
import dayjs from 'dayjs';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';

import MantineIcon from '../MantineIcon';
import { DashboardList } from './DashboardList';

type Props = {
    resourceUuid: string;
    withChartData?: boolean;
    description?: string;
    projectUuid: string;
    viewStats?: number;
    firstViewedAt?: Date | string | null;
};

export const ResourceInfoPopup: FC<Props> = ({
    resourceUuid,
    description,
    projectUuid,
    viewStats,
    firstViewedAt,
    withChartData = false,
}) => {
    const { t } = useTranslation();

    const label =
        firstViewedAt && viewStats
            ? `${viewStats} ${t(
                  'components_common_resource_info_popup.views_since',
              )} ${dayjs(firstViewedAt).format('MMM D, YYYY h:mm A')}`
            : undefined;

    if (!viewStats && !description && !withChartData) return null;

    return (
        <HoverCard
            offset={-1}
            position="bottom"
            withArrow
            shadow="md"
            withinPortal
        >
            <HoverCard.Target>
                <MantineIcon icon={IconInfoCircle} color="gray.6" />
            </HoverCard.Target>
            <HoverCard.Dropdown maw={300}>
                <Stack spacing="xs">
                    {viewStats && viewStats > 0 ? (
                        <Stack spacing="two">
                            <Text fz="xs" fw={600} color="gray.6">
                                {t(
                                    'components_common_resource_info_popup.views',
                                )}
                                :
                            </Text>
                            <Tooltip
                                position="top-start"
                                label={label}
                                disabled={!viewStats || !firstViewedAt}
                            >
                                <Group spacing="two">
                                    <MantineIcon size={12} icon={IconEye} />
                                    <Text fz="xs">{viewStats || '0'}</Text>
                                </Group>
                            </Tooltip>
                        </Stack>
                    ) : null}

                    {description && (
                        <Stack spacing="two">
                            <Text fz="xs" fw={600} color="gray.6">
                                {t(
                                    'components_common_resource_info_popup.description',
                                )}
                                :{' '}
                            </Text>
                            <Text fz="xs">{description}</Text>
                        </Stack>
                    )}

                    <>
                        {withChartData && (
                            <>
                                <DashboardList
                                    resourceItemId={resourceUuid}
                                    projectUuid={projectUuid}
                                />
                            </>
                        )}
                    </>
                </Stack>
            </HoverCard.Dropdown>
        </HoverCard>
    );
};
