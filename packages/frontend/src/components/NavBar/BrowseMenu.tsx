import { subject } from '@casl/ability';
import { Box, Button, Center, Loader, Menu, ScrollArea } from '@mantine/core';
import {
    IconCategory,
    IconChartAreaLine,
    IconFolder,
    IconFolders,
    IconLayoutDashboard,
} from '@tabler/icons-react';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { useHasMetricsInCatalog } from '../../features/metricsCatalog/hooks/useMetricsCatalog';
import { useSpaceSummaries } from '../../hooks/useSpaces';
import useApp from '../../providers/App/useApp';
import MantineIcon from '../common/MantineIcon';
import { MetricsLink } from './MetricsLink';

interface Props {
    projectUuid: string;
    isCustomerUse: boolean;
}

const BrowseMenu: FC<Props> = ({ projectUuid, isCustomerUse }) => {
    const { t } = useTranslation();
    const { user } = useApp();

    const { data: spaces, isInitialLoading } = useSpaceSummaries(
        projectUuid,
        true,
        {
            select: (data) => data.filter((space) => !space.parentSpaceUuid),
        },
    );
    const { data: hasMetrics } = useHasMetricsInCatalog({
        projectUuid,
    });

    // 检查用户是否有管理员权限（manage Project）
    const userCanManageProject = user.data?.ability?.can(
        'manage',
        subject('Project', {
            organizationUuid: user.data?.organizationUuid,
            projectUuid,
        }),
    );

    // 客户使用模式下，管理员可以多看到"全部空间"
    const isCustomerUseWithAdmin = isCustomerUse && userCanManageProject;

    if (isCustomerUse && !userCanManageProject) {
        // 客户使用模式 + 普通用户：只显示 Dashboards
        return (
            <Menu
                withArrow
                withinPortal
                shadow="lg"
                position="bottom-start"
                arrowOffset={16}
                offset={-2}
            >
                <Menu.Target>
                    <Button
                        variant="default"
                        size="xs"
                        fz="sm"
                        leftIcon={
                            <MantineIcon color="#adb5bd" icon={IconCategory} />
                        }
                    >
                        {t('components_navbar_browse_menu.title')}
                    </Button>
                </Menu.Target>
                <Menu.Dropdown>
                    <Menu.Item
                        component={Link}
                        to={`/projects/${projectUuid}/dashboards`}
                        icon={<MantineIcon icon={IconLayoutDashboard} />}
                    >
                        {t(
                            'components_navbar_browse_menu.menus.dashboards.title',
                        )}
                    </Menu.Item>
                </Menu.Dropdown>
            </Menu>
        );
    }

    if (isCustomerUseWithAdmin) {
        // 客户使用模式 + 管理员：显示 Dashboards + 全部空间
        return (
            <Menu
                withArrow
                withinPortal
                shadow="lg"
                position="bottom-start"
                arrowOffset={16}
                offset={-2}
            >
                <Menu.Target>
                    <Button
                        variant="default"
                        size="xs"
                        fz="sm"
                        leftIcon={
                            <MantineIcon color="#adb5bd" icon={IconCategory} />
                        }
                    >
                        {t('components_navbar_browse_menu.title')}
                    </Button>
                </Menu.Target>
                <Menu.Dropdown>
                    <Menu.Item
                        component={Link}
                        to={`/projects/${projectUuid}/spaces`}
                        icon={<MantineIcon icon={IconFolders} />}
                    >
                        {t('components_navbar_browse_menu.menus.spaces.title')}
                    </Menu.Item>

                    <Menu.Item
                        component={Link}
                        to={`/projects/${projectUuid}/dashboards`}
                        icon={<MantineIcon icon={IconLayoutDashboard} />}
                    >
                        {t(
                            'components_navbar_browse_menu.menus.dashboards.title',
                        )}
                    </Menu.Item>

                    {isInitialLoading || (spaces && spaces.length > 0) ? (
                        <>
                            <Menu.Divider />
                            <Menu.Label>
                                {t(
                                    'components_navbar_browse_menu.divider_label',
                                )}
                            </Menu.Label>

                            {isInitialLoading ? (
                                <Center my="sm">
                                    <Loader size="sm" color="gray" />
                                </Center>
                            ) : null}
                        </>
                    ) : null}

                    <ScrollArea
                        variant="primary"
                        className="only-vertical"
                        scrollbarSize={6}
                        type="hover"
                    >
                        <Box mah={300}>
                            {spaces
                                ?.sort((a, b) => a.name.localeCompare(b.name))
                                .map((space) => (
                                    <Menu.Item
                                        key={space.uuid}
                                        component={Link}
                                        to={`/projects/${projectUuid}/spaces/${space.uuid}`}
                                        icon={<MantineIcon icon={IconFolder} />}
                                    >
                                        {space.name}
                                    </Menu.Item>
                                ))}
                        </Box>
                    </ScrollArea>
                </Menu.Dropdown>
            </Menu>
        );
    }

    return (
        <Menu
            withArrow
            withinPortal
            shadow="lg"
            position="bottom-start"
            arrowOffset={16}
            offset={-2}
        >
            <Menu.Target>
                <Button
                    variant="default"
                    size="xs"
                    fz="sm"
                    leftIcon={
                        <MantineIcon color="#adb5bd" icon={IconCategory} />
                    }
                >
                    {t('components_navbar_browse_menu.title')}
                </Button>
            </Menu.Target>

            <Menu.Dropdown>
                <Menu.Item
                    component={Link}
                    to={`/projects/${projectUuid}/spaces`}
                    icon={<MantineIcon icon={IconFolders} />}
                >
                    {t('components_navbar_browse_menu.menus.spaces.title')}
                </Menu.Item>

                <Menu.Item
                    component={Link}
                    to={`/projects/${projectUuid}/dashboards`}
                    icon={<MantineIcon icon={IconLayoutDashboard} />}
                >
                    {t('components_navbar_browse_menu.menus.dashboards.title')}
                </Menu.Item>

                <Menu.Item
                    component={Link}
                    to={`/projects/${projectUuid}/saved`}
                    icon={<MantineIcon icon={IconChartAreaLine} />}
                >
                    {t('components_navbar_browse_menu.menus.charts.title')}
                </Menu.Item>

                {!hasMetrics && (
                    <MetricsLink projectUuid={projectUuid} asMenu />
                )}

                {isInitialLoading || (spaces && spaces.length > 0) ? (
                    <>
                        <Menu.Divider />
                        <Menu.Label>
                            {t('components_navbar_browse_menu.divider_label')}
                        </Menu.Label>

                        {isInitialLoading ? (
                            <Center my="sm">
                                <Loader size="sm" color="gray" />
                            </Center>
                        ) : null}
                    </>
                ) : null}

                <ScrollArea
                    variant="primary"
                    className="only-vertical"
                    scrollbarSize={6}
                    type="hover"
                >
                    <Box mah={300}>
                        {spaces
                            ?.sort((a, b) => a.name.localeCompare(b.name))
                            .map((space) => (
                                <Menu.Item
                                    key={space.uuid}
                                    component={Link}
                                    to={`/projects/${projectUuid}/spaces/${space.uuid}`}
                                    icon={<MantineIcon icon={IconFolder} />}
                                >
                                    {space.name}
                                </Menu.Item>
                            ))}
                    </Box>
                </ScrollArea>
            </Menu.Dropdown>
        </Menu>
    );
};
export default BrowseMenu;
