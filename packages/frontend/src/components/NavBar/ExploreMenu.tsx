import { subject } from '@casl/ability';
import { Button, Menu } from '@mantine/core';
import {
    IconFolder,
    IconFolderPlus,
    IconLayoutDashboard,
    IconSquareRoundedPlus,
    IconTable,
    IconTerminal2,
} from '@tabler/icons-react';
import { memo, useState, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate } from 'react-router';
import useCreateInAnySpaceAccess from '../../hooks/user/useCreateInAnySpaceAccess';
import { Can } from '../../providers/Ability';
import useApp from '../../providers/App/useApp';
import LargeMenuItem from '../common/LargeMenuItem';
import MantineIcon from '../common/MantineIcon';
import SpaceActionModal from '../common/SpaceActionModal';
import { ActionType } from '../common/SpaceActionModal/types';
import DashboardCreateModal from '../common/modal/DashboardCreateModal';

type Props = {
    projectUuid: string;
};

const ExploreMenu: FC<Props> = memo(({ projectUuid }) => {
    const { t } = useTranslation();

    const navigate = useNavigate();
    const location = useLocation();

    const { user } = useApp();

    const userCanCreateDashboards = useCreateInAnySpaceAccess(
        projectUuid,
        'Dashboard',
    );

    const [isOpen, setIsOpen] = useState(false);
    const [isCreateSpaceOpen, setIsCreateSpaceOpen] = useState(false);
    const [isCreateDashboardOpen, setIsCreateDashboardOpen] = useState(false);

    return (
        <>
            <Can
                I="manage"
                this={subject('Explore', {
                    organizationUuid: user.data?.organizationUuid,
                    projectUuid,
                })}
            >
                <Menu
                    withArrow
                    shadow="lg"
                    position="bottom-start"
                    arrowOffset={16}
                    offset={-2}
                    withinPortal
                >
                    <Menu.Target>
                        <Button
                            variant="default"
                            size="xs"
                            fz="sm"
                            leftIcon={
                                <MantineIcon
                                    color="#adb5bd"
                                    icon={IconSquareRoundedPlus}
                                />
                            }
                            onClick={() => setIsOpen(!isOpen)}
                            data-testid="ExploreMenu/NewButton"
                        >
                            {t('components_navbar_explore_menu.title')}
                        </Button>
                    </Menu.Target>

                    <Menu.Dropdown>
                        <LargeMenuItem
                            component={Link}
                            title={t(
                                'components_navbar_explore_menu.menus.query_tables.title',
                            )}
                            description={t(
                                'components_navbar_explore_menu.menus.query_tables.description',
                            )}
                            to={`/projects/${projectUuid}/tables`}
                            icon={IconTable}
                        />

                        <Can
                            I="manage"
                            this={subject('SqlRunner', {
                                organizationUuid: user.data?.organizationUuid,
                                projectUuid,
                            })}
                        >
                            <LargeMenuItem
                                component={Link}
                                title={t(
                                    'components_navbar_explore_menu.menus.sql_runner.title',
                                )}
                                description={t(
                                    'components_navbar_explore_menu.menus.sql_runner.description',
                                )}
                                to={`/projects/${projectUuid}/sql-runner`}
                                onClick={(
                                    event: React.MouseEvent<HTMLAnchorElement>,
                                ) => {
                                    if (
                                        location.pathname.startsWith(
                                            `/projects/${projectUuid}/sql-runner`,
                                        )
                                    ) {
                                        event.preventDefault();
                                        window.open(
                                            `/projects/${projectUuid}/sql-runner`,
                                            '_blank',
                                        );
                                    }
                                }}
                                icon={IconTerminal2}
                            />
                        </Can>

                        {userCanCreateDashboards && (
                            <LargeMenuItem
                                title={t(
                                    'components_navbar_explore_menu.menus.dashboard.title',
                                )}
                                description={t(
                                    'components_navbar_explore_menu.menus.dashboard.description',
                                )}
                                onClick={() => setIsCreateDashboardOpen(true)}
                                icon={IconLayoutDashboard}
                                data-testid="ExploreMenu/NewDashboardButton"
                            />
                        )}

                        <Can
                            I="create"
                            this={subject('Space', {
                                organizationUuid: user.data?.organizationUuid,
                                projectUuid,
                            })}
                        >
                            <LargeMenuItem
                                title={t(
                                    'components_navbar_explore_menu.menus.space.title',
                                )}
                                description={t(
                                    'components_navbar_explore_menu.menus.space.description',
                                )}
                                onClick={() => setIsCreateSpaceOpen(true)}
                                icon={IconFolder}
                            />
                        </Can>
                    </Menu.Dropdown>
                </Menu>
            </Can>

            {isCreateSpaceOpen && (
                <SpaceActionModal
                    projectUuid={projectUuid}
                    actionType={ActionType.CREATE}
                    title={t('components_navbar_explore_menu.create.title')}
                    confirmButtonLabel={t(
                        'components_navbar_explore_menu.create.label',
                    )}
                    icon={IconFolderPlus}
                    onClose={() => setIsCreateSpaceOpen(false)}
                    onSubmitForm={(space) => {
                        if (space)
                            void navigate(
                                `/projects/${projectUuid}/spaces/${space.uuid}`,
                            );
                    }}
                    parentSpaceUuid={null}
                />
            )}

            <DashboardCreateModal
                projectUuid={projectUuid}
                opened={isCreateDashboardOpen}
                onClose={() => setIsCreateDashboardOpen(false)}
                onConfirm={(dashboard) => {
                    void navigate(
                        `/projects/${projectUuid}/dashboards/${dashboard.uuid}/edit`,
                    );

                    setIsCreateDashboardOpen(false);
                }}
            />
        </>
    );
});
export default ExploreMenu;
