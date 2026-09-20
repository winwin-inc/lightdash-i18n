import { DbtProjectType, JobStatusType, ProjectType } from '@lightdash/common';
import {
    Badge,
    Box,
    Button,
    Group,
    Popover,
    Text,
    Tooltip,
    type ButtonProps,
} from '@mantine-8/core';
import { IconRefresh } from '@tabler/icons-react';
import { useEffect, useState, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';

import { useProject } from '../../hooks/useProject';
import { useRefreshServer } from '../../hooks/useRefreshServer';
import { useAbilityContext } from '../../providers/Ability/useAbilityContext';
import useActiveJob from '../../providers/ActiveJob/useActiveJob';
import useTracking from '../../providers/Tracking/useTracking';
import { EventName } from '../../types/Events';
import MantineIcon from '../common/MantineIcon';

const RefreshDbtButton: FC<{
    onClick?: () => void;
    buttonStyles?: ButtonProps['style'];
    leftIcon?: React.ReactNode;
    defaultTextOverride?: React.ReactNode;
    refreshingTextOverride?: React.ReactNode;
}> = ({
    onClick,
    buttonStyles,
    leftIcon,
    defaultTextOverride,
    refreshingTextOverride,
}) => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const { data } = useProject(projectUuid);
    const { activeJob } = useActiveJob();
    const { mutate: refreshDbtServer } = useRefreshServer();
    const { t } = useTranslation();
    const { track } = useTracking();

    const ability = useAbilityContext();

    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        if (activeJob) {
            if (
                [JobStatusType.STARTED, JobStatusType.RUNNING].includes(
                    activeJob.jobStatus,
                )
            ) {
                setIsLoading(true);
            }

            if (
                [JobStatusType.DONE, JobStatusType.ERROR].includes(
                    activeJob.jobStatus,
                )
            ) {
                setIsLoading(false);
            }
        }
    }, [activeJob, activeJob?.jobStatus]);

    if (
        ability?.cannot('manage', 'Job') ||
        ability?.cannot('manage', 'CompileProject')
    )
        return null;

    if (
        data?.dbtConnection?.type === DbtProjectType.NONE ||
        data?.dbtConnection?.type === DbtProjectType.MANIFEST
    ) {
        if (data?.dbtConnection.hideRefreshButton) {
            return null;
        }
        return (
            <Popover withinPortal withArrow width={300}>
                <Popover.Target>
                    <Box
                        style={{
                            cursor: 'pointer',
                        }}
                    >
                        <Button
                            size="xs"
                            variant="outline"
                            leftSection={<MantineIcon icon={IconRefresh} />}
                            disabled
                        >
                            {t('components_refresh_dbt_button.refresh')}
                        </Button>
                    </Box>
                </Popover.Target>
                <Popover.Dropdown>
                    <Text>
                        {t('components_refresh_dbt_button.tip.part_1')}
                        <br />
                        {t('components_refresh_dbt_button.tip.part_2')}
                        <br /> {t(
                            'components_refresh_dbt_button.tip.part_3',
                        )}{' '}
                        {t('components_refresh_dbt_button.tip.part_4')}
                        {t('components_refresh_dbt_button.tip.part_5')}{' '}
                        {t('components_refresh_dbt_button.tip.part_6')}
                        <br />
                        {t('components_refresh_dbt_button.tip.part_7')}{' '}
                        {t('components_refresh_dbt_button.tip.part_8')}
                        {t('components_refresh_dbt_button.tip.part_9')}
                    </Text>
                </Popover.Dropdown>
            </Popover>
        );
    }

    const handleRefresh = () => {
        setIsLoading(true);
        refreshDbtServer();
        onClick?.();
        track({
            name: EventName.REFRESH_DBT_CONNECTION_BUTTON_CLICKED,
        });
    };

    return (
        <Group gap="xs">
            <Tooltip
                withinPortal
                multiline
                w={320}
                position="bottom"
                label={t('components_refresh_dbt_button.tooltip_refresh.label')}
            >
                <Button
                    size="xs"
                    variant="default"
                    leftSection={leftIcon ?? <MantineIcon icon={IconRefresh} />}
                    loading={isLoading}
                    onClick={handleRefresh}
                    style={buttonStyles}
                >
                    {!isLoading
                        ? defaultTextOverride ??
                          t('components_refresh_dbt_button.refresh')
                        : refreshingTextOverride ??
                          t('components_refresh_dbt_button.loading')}
                </Button>
            </Tooltip>
            {data?.type === ProjectType.PREVIEW && (
                <Tooltip
                    withinPortal
                    label={t(
                        'components_refresh_dbt_button.tooltip_preview.label',
                    )}
                >
                    <Badge color="yellow" size="lg" radius="sm">
                        {t(
                            'components_refresh_dbt_button.tooltip_preview.text',
                        )}
                    </Badge>
                </Tooltip>
            )}
        </Group>
    );
};

export default RefreshDbtButton;
