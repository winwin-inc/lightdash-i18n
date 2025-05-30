import { DbtProjectType, JobStatusType, ProjectType } from '@lightdash/common';
import {
    Anchor,
    Badge,
    Box,
    Button,
    Group,
    Popover,
    Text,
    Tooltip,
    type ButtonProps,
} from '@mantine/core';
import { IconRefresh } from '@tabler/icons-react';
import { useEffect, useState, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';

import { useProject } from '../../hooks/useProject';
import { useRefreshServer } from '../../hooks/useRefreshServer';
import useActiveJob from '../../providers/ActiveJob/useActiveJob';
import useApp from '../../providers/App/useApp';
import useTracking from '../../providers/Tracking/useTracking';
import { EventName } from '../../types/Events';
import MantineIcon from '../common/MantineIcon';

const RefreshDbtButton: FC<{
    onClick?: () => void;
    buttonStyles?: ButtonProps['sx'];
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
    const { user } = useApp();

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
        user.data?.ability?.cannot('manage', 'Job') ||
        user.data?.ability?.cannot('manage', 'CompileProject')
    )
        return null;

    if (data?.dbtConnection?.type === DbtProjectType.NONE) {
        if (data?.dbtConnection.hideRefreshButton) {
            return null;
        }
        return (
            <Popover withinPortal withArrow width={300}>
                <Popover.Target>
                    <Box
                        sx={{
                            cursor: 'pointer',
                        }}
                    >
                        <Button
                            size="xs"
                            variant="outline"
                            leftIcon={<MantineIcon icon={IconRefresh} />}
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
                        <Anchor
                            href={
                                'https://docs.lightdash.com/get-started/setup-lightdash/connect-project#2-import-a-dbt-project'
                            }
                            target="_blank"
                            rel="noreferrer"
                        >
                            {t('components_refresh_dbt_button.tip.part_4')}
                        </Anchor>
                        {t('components_refresh_dbt_button.tip.part_5')}{' '}
                        <Anchor
                            href={
                                'https://docs.lightdash.com/guides/cli/how-to-use-lightdash-deploy#automatically-deploy-your-changes-to-lightdash-using-a-github-action'
                            }
                            target="_blank"
                            rel="noreferrer"
                        >
                            {t('components_refresh_dbt_button.tip.part_6')}
                        </Anchor>
                        <br />
                        {t('components_refresh_dbt_button.tip.part_7')}{' '}
                        <Anchor
                            href={
                                'https://docs.lightdash.com/guides/cli/how-to-use-lightdash-deploy#lightdash-deploy-syncs-the-changes-in-your-dbt-project-to-lightdash'
                            }
                            target="_blank"
                            rel="noreferrer"
                        >
                            {t('components_refresh_dbt_button.tip.part_8')}
                        </Anchor>
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
        <Group spacing="xs">
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
                    leftIcon={leftIcon ?? <MantineIcon icon={IconRefresh} />}
                    loading={isLoading}
                    onClick={handleRefresh}
                    sx={buttonStyles}
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
