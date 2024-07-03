import { Button, Center, Loader, Menu } from '@mantine/core';
import {
    IconCategory,
    IconChartAreaLine,
    IconFolder,
    IconFolders,
    IconLayoutDashboard,
} from '@tabler/icons-react';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { useSpaceSummaries } from '../../hooks/useSpaces';
import MantineIcon from '../common/MantineIcon';

interface Props {
    projectUuid: string;
}

const BrowseMenu: FC<Props> = ({ projectUuid }) => {
    const { data: spaces, isInitialLoading } = useSpaceSummaries(
        projectUuid,
        true,
    );
    const { t } = useTranslation();

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
                    leftIcon={<MantineIcon icon={IconCategory} />}
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
            </Menu.Dropdown>
        </Menu>
    );
};
export default BrowseMenu;
