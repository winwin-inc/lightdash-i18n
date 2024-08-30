import { subject } from '@casl/ability';
import { FeatureFlags } from '@lightdash/common';
import { Button, Menu } from '@mantine/core';
import {
    IconFolder,
    IconFolderPlus,
    IconLayersIntersect,
    IconLayoutDashboard,
    IconSquareRoundedPlus,
    IconTable,
    IconTerminal2,
} from '@tabler/icons-react';
import { memo, useState, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useHistory } from 'react-router-dom';

import { useFeatureFlagEnabled } from '../../hooks/useFeatureFlagEnabled';
import { useApp } from '../../providers/AppProvider';
import { Can } from '../common/Authorization';
import LargeMenuItem from '../common/LargeMenuItem';
import MantineIcon from '../common/MantineIcon';
import DashboardCreateModal from '../common/modal/DashboardCreateModal';
import SpaceActionModal, { ActionType } from '../common/SpaceActionModal';

type Props = {
    projectUuid: string;
};

const ExploreMenu: FC<Props> = memo(({ projectUuid }) => {
    const { user, health } = useApp();
    const history = useHistory();
    const { t } = useTranslation();

    const [isOpen, setIsOpen] = useState<boolean>(false);

    const [isCreateSpaceOpen, setIsCreateSpaceOpen] = useState<boolean>(false);
    const [isCreateDashboardOpen, setIsCreateDashboardOpen] =
        useState<boolean>(false);

    const canSaveSqlChart = useFeatureFlagEnabled(FeatureFlags.SaveSqlChart);

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
                                <MantineIcon icon={IconSquareRoundedPlus} />
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
                        {health.data?.hasDbtSemanticLayer && (
                            <LargeMenuItem
                                component={Link}
                                title={t(
                                    'components_navbar_explore_menu.menus.dbt_semantic.title',
                                )}
                                description={t(
                                    'components_navbar_explore_menu.menus.dbt_semantic.description',
                                )}
                                to={`/projects/${projectUuid}/dbtsemanticlayer`}
                                icon={IconLayersIntersect}
                            />
                        )}
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
                                to={`/projects/${projectUuid}/${
                                    canSaveSqlChart ? 'sql-runner' : 'sqlRunner'
                                }`}
                                icon={IconTerminal2}
                            />
                        </Can>

                        <Can
                            I="create"
                            this={subject('Dashboard', {
                                organizationUuid: user.data?.organizationUuid,
                                projectUuid,
                            })}
                        >
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
                        </Can>

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
                            history.push(
                                `/projects/${projectUuid}/spaces/${space.uuid}`,
                            );
                    }}
                />
            )}

            <DashboardCreateModal
                projectUuid={projectUuid}
                opened={isCreateDashboardOpen}
                onClose={() => setIsCreateDashboardOpen(false)}
                onConfirm={(dashboard) => {
                    history.push(
                        `/projects/${projectUuid}/dashboards/${dashboard.uuid}/edit`,
                    );

                    setIsCreateDashboardOpen(false);
                }}
            />
        </>
    );
});
export default ExploreMenu;
