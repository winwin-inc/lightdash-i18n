import { getTimezoneLabel } from '@lightdash/common';
import { Badge, Group, Tooltip } from '@mantine/core';
import { IconClock } from '@tabler/icons-react';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { getTimezoneSourceLabel } from '../../../utils/timezoneSourceLabel';
import MantineIcon from '../../common/MantineIcon';

type Props = {
    resolvedTimezone: string | null | undefined;
    timezoneSetting: string | null | undefined;
};

const VisualizationTimezone: FC<Props> = ({
    resolvedTimezone,
    timezoneSetting,
}) => {
    const { t } = useTranslation();

    if (!resolvedTimezone) return null;

    return (
        <Tooltip
            label={getTimezoneSourceLabel(
                timezoneSetting,
                resolvedTimezone,
                t,
            )}
            position="bottom"
            multiline
            width={260}
        >
            <Badge
                color="gray"
                variant="outline"
                size="sm"
                sx={{ textTransform: 'none', cursor: 'default' }}
            >
                <Group spacing={4} noWrap>
                    <MantineIcon icon={IconClock} size="sm" />
                    {getTimezoneLabel(resolvedTimezone)}
                </Group>
            </Badge>
        </Tooltip>
    );
};

export default VisualizationTimezone;
