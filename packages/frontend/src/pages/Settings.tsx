import { subject } from '@casl/ability';
import { CommercialFeatureFlags, FeatureFlags } from '@lightdash/common';
import { Box, ScrollArea, Stack, Text, Title } from '@mantine/core';
import {
    IconBrain,
    IconBrowser,
    IconBuildingSkyscraper,
    IconCalendarStats,
    IconChecklist,
    IconDatabase,
    IconDatabaseCog,
    IconDatabaseExport,
    IconKey,
    IconLayersLinked,
    IconLock,
    IconPalette,
    IconPlug,
    IconReportAnalytics,
    IconTableOptions,
    IconUserCircle,
    IconUserPlus,
    IconUsers,
    IconUserShield,
} from '@tabler/icons-react';
import { useMemo, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useRoutes, type RouteObject } from 'react-router';
import PageSpinner from '../components/PageSpinner';
import AccessTokensPanel from '../components/UserSettings/AccessTokensPanel';
import AiAgentsPanel from '../components/UserSettings/AiAgentsPanel';
import AllowedDomainsPanel from '../components/UserSettings/AllowedDomainsPanel';
import AppearanceSettingsPanel from '../components/UserSettings/AppearanceSettingsPanel';
import DefaultProjectPanel from '../components/UserSettings/DefaultProjectPanel';
import { DeleteOrganizationPanel } from '../components/UserSettings/DeleteOrganizationPanel';
import GithubSettingsPanel from '../components/UserSettings/GithubSettingsPanel';
import { MyWarehouseConnectionsPanel } from '../components/UserSettings/MyWarehouseConnectionsPanel';
import OrganizationPanel from '../components/UserSettings/OrganizationPanel';
import PasswordPanel from '../components/UserSettings/PasswordPanel';
import ProfilePanel from '../components/UserSettings/ProfilePanel';
import ProjectManagementPanel from '../components/UserSettings/ProjectManagementPanel';
import SlackSettingsPanel from '../components/UserSettings/SlackSettingsPanel';
import SocialLoginsPanel from '../components/UserSettings/SocialLoginsPanel';
import UserAttributesPanel from '../components/UserSettings/UserAttributesPanel';
import UsersAndGroupsPanel from '../components/UserSettings/UsersAndGroupsPanel';
import ErrorState from '../components/common/ErrorState';
import MantineIcon from '../components/common/MantineIcon';
import Page from '../components/common/Page/Page';
import PageBreadcrumbs from '../components/common/PageBreadcrumbs';
import RouterNavLink from '../components/common/RouterNavLink';
import { SettingsGridCard } from '../components/common/Settings/SettingsCard';
import { OrganizationAiAgent } from '../ee/features/aiCopilot/components/OrganizationAiAgent';
import ScimAccessTokensPanel from '../ee/features/scim/components/ScimAccessTokensPanel';
import { useOrganization } from '../hooks/organization/useOrganization';
import { useActiveProjectUuid } from '../hooks/useActiveProject';
import {
    useFeatureFlag,
    useFeatureFlagEnabled,
} from '../hooks/useFeatureFlagEnabled';
import { useProject } from '../hooks/useProject';
import useApp from '../providers/App/useApp';
import { TrackPage } from '../providers/Tracking/TrackingProvider';
import useTracking from '../providers/Tracking/useTracking';
import { EventName, PageName } from '../types/Events';
import ProjectSettings from './ProjectSettings';

const Settings: FC = () => {
    const { t } = useTranslation();

    const { data: embeddingEnabled } = useFeatureFlag(
        CommercialFeatureFlags.Embedding,
    );
    const isPassthroughLoginFeatureEnabled = useFeatureFlagEnabled(
        FeatureFlags.PassthroughLogin,
    );

    const isSemanticLayerEnabled = useFeatureFlagEnabled(
        FeatureFlags.SemanticLayerEnabled,
    );

    const { data: isScimTokenManagementEnabled } = useFeatureFlag(
        CommercialFeatureFlags.Scim,
    );

    const { data: aiCopilotFlag } = useFeatureFlag(
        CommercialFeatureFlags.AiCopilot,
    );

    const {
        health: {
            data: health,
            isInitialLoading: isHealthLoading,
            error: healthError,
        },
        user: { data: user, isInitialLoading: isUserLoading, error: userError },
    } = useApp();
    const { data: UserGroupFeatureFlag } = useFeatureFlag(
        FeatureFlags.UserGroupsEnabled,
    );
    const { track } = useTracking();
    const {
        data: organization,
        isInitialLoading: isOrganizationLoading,
        error: organizationError,
    } = useOrganization();
    const { activeProjectUuid, isLoading: isActiveProjectUuidLoading } =
        useActiveProjectUuid();
    const {
        data: project,
        isInitialLoading: isProjectLoading,
        error: projectError,
    } = useProject(activeProjectUuid);

    const allowPasswordAuthentication =
        !health?.auth.disablePasswordAuthentication;

    const hasSocialLogin =
        health?.auth.google.enabled ||
        health?.auth.okta.enabled ||
        health?.auth.oneLogin.enabled ||
        health?.auth.azuread.enabled ||
        health?.auth.oidc.enabled;

    const isGroupManagementEnabled = UserGroupFeatureFlag?.enabled;

    const routes = useMemo<RouteObject[]>(() => {
        const allowedRoutes: RouteObject[] = [
            {
                path: '/appearance',
                element: <AppearanceSettingsPanel />,
            },
            {
                path: '/profile',
                element: (
                    <SettingsGridCard>
                        <Title order={4}>
                            {t('pages_settings.routes.password_settings')}
                        </Title>
                        <ProfilePanel />
                    </SettingsGridCard>
                ),
            },
            {
                path: '*',
                element: <Navigate to="/generalSettings/profile" />,
            },
        ];

        if (allowPasswordAuthentication) {
            allowedRoutes.push({
                path: '/password',
                element: (
                    <Stack spacing="xl">
                        <SettingsGridCard>
                            <Title order={4}>
                                {t('pages_settings.routes.password_settings')}
                            </Title>
                            <PasswordPanel />
                        </SettingsGridCard>

                        {hasSocialLogin && (
                            <SettingsGridCard>
                                <Title order={4}>
                                    {t('pages_settings.routes.social_logins')}
                                </Title>
                                <SocialLoginsPanel />
                            </SettingsGridCard>
                        )}
                    </Stack>
                ),
            });
        }
        if (isPassthroughLoginFeatureEnabled) {
            allowedRoutes.push({
                path: '/myWarehouseConnections',
                element: (
                    <Stack spacing="xl">
                        <MyWarehouseConnectionsPanel />
                    </Stack>
                ),
            });
        }
        if (user?.ability.can('manage', 'PersonalAccessToken')) {
            allowedRoutes.push({
                path: '/organization',
                element: (
                    <Stack spacing="xl">
                        <SettingsGridCard>
                            <Title order={4}>
                                {t('pages_settings.routes.general')}
                            </Title>
                            <OrganizationPanel />
                        </SettingsGridCard>

                        <SettingsGridCard>
                            <div>
                                <Title order={4}>
                                    {t('pages_settings.routes.allow.part_1')}
                                </Title>
                                <Text c="gray.6" fz="xs">
                                    {t('pages_settings.routes.allow.part_2')}
                                </Text>
                            </div>
                            <AllowedDomainsPanel />
                        </SettingsGridCard>

                        <SettingsGridCard>
                            <div>
                                <Title order={4}>
                                    {t(
                                        'pages_settings.routes.default_project.part_1',
                                    )}
                                </Title>
                                <Text c="gray.6" fz="xs">
                                    {t(
                                        'pages_settings.routes.default_project.part_2',
                                    )}
                                </Text>
                            </div>
                            <DefaultProjectPanel />
                        </SettingsGridCard>

                        {user.ability?.can('delete', 'Organization') && (
                            <SettingsGridCard>
                                <div>
                                    <Title order={4}>
                                        {t(
                                            'pages_settings.routes.danger_zone.part_1',
                                        )}
                                    </Title>
                                    <Text c="gray.6" fz="xs">
                                        {t(
                                            'pages_settings.routes.danger_zone.part_2',
                                        )}
                                    </Text>
                                </div>
                                <DeleteOrganizationPanel />
                            </SettingsGridCard>
                        )}
                    </Stack>
                ),
            });
        }
        if (
            user?.ability.can(
                'manage',
                subject('OrganizationMemberProfile', {
                    organizationUuid: organization?.organizationUuid,
                }),
            )
        ) {
            allowedRoutes.push({
                path: '/userManagement',
                element: <UsersAndGroupsPanel />,
            });
        }

        if (
            user?.ability.can(
                'manage',
                subject('Organization', {
                    organizationUuid: organization?.organizationUuid,
                }),
            )
        ) {
            allowedRoutes.push({
                path: '/userAttributes',
                element: <UserAttributesPanel />,
            });
        }
        if (
            organization &&
            !organization.needsProject &&
            user?.ability.can('view', 'Project')
        ) {
            allowedRoutes.push({
                path: '/projectManagement',
                element: <ProjectManagementPanel />,
            });
        }

        if (
            project &&
            organization &&
            !organization.needsProject &&
            user?.ability.can(
                'update',
                subject('Project', {
                    organizationUuid: organization.organizationUuid,
                    projectUuid: project.projectUuid,
                }),
            )
        ) {
            allowedRoutes.push({
                path: '/projectManagement/:projectUuid/*',
                element: (
                    <TrackPage name={PageName.PROJECT_SETTINGS}>
                        <ProjectSettings />
                    </TrackPage>
                ),
            });
        }
        if (user?.ability.can('manage', 'PersonalAccessToken')) {
            allowedRoutes.push({
                path: '/personalAccessTokens',
                element: <AccessTokensPanel />,
            });
        }

        if (user?.ability.can('manage', 'Organization')) {
            allowedRoutes.push({
                path: '/integrations',
                element: (
                    <Stack>
                        <Title order={4}>
                            {t('pages_settings.routes.integrations')}
                        </Title>
                        {!health?.hasSlack &&
                            !health?.hasGithub &&
                            t(
                                'pages_settings.routes.no_integrations_available',
                            )}
                        {health?.hasSlack && <SlackSettingsPanel />}
                        {health?.hasGithub && <GithubSettingsPanel />}
                    </Stack>
                ),
            });
        }

        // Commercial route
        if (
            user?.ability.can('manage', 'Organization') &&
            isScimTokenManagementEnabled?.enabled
        ) {
            allowedRoutes.push({
                path: '/scimAccessTokens',
                element: <ScimAccessTokensPanel />,
            });
        }

        if (user?.ability.can('manage', 'AiAgent') && aiCopilotFlag?.enabled) {
            allowedRoutes.push({
                path: '/aiAgents',
                element: <AiAgentsPanel />,
            });
            allowedRoutes.push({
                path: '/aiAgents/:agentId',
                element: <OrganizationAiAgent />,
            });
        }

        return allowedRoutes;
    }, [
        isScimTokenManagementEnabled?.enabled,
        isPassthroughLoginFeatureEnabled,
        allowPasswordAuthentication,
        hasSocialLogin,
        user,
        organization,
        project,
        health,
        t,
        aiCopilotFlag?.enabled,
    ]);
    const routeElements = useRoutes(routes);

    if (
        isHealthLoading ||
        isUserLoading ||
        isOrganizationLoading ||
        isActiveProjectUuidLoading ||
        isProjectLoading
    ) {
        return <PageSpinner />;
    }

    if (userError || healthError || organizationError || projectError) {
        return (
            <ErrorState
                error={
                    userError?.error ||
                    healthError?.error ||
                    organizationError?.error ||
                    projectError?.error
                }
            />
        );
    }

    if (!health || !user || !organization) return null;

    return (
        <Page
            withFullHeight
            withSidebarFooter
            withFixedContent
            withPaddedContent
            title={t('pages_settings.title')}
            sidebar={
                <Stack sx={{ flexGrow: 1, overflow: 'hidden' }}>
                    <PageBreadcrumbs
                        items={[
                            { title: t('pages_settings.title'), active: true },
                        ]}
                    />
                    <ScrollArea
                        variant="primary"
                        offsetScrollbars
                        scrollbarSize={8}
                    >
                        <Stack spacing="lg">
                            <Box>
                                <Title order={6} fw={600} mb="xs">
                                    {t('pages_settings.scroll_area_box.title')}
                                </Title>

                                <RouterNavLink
                                    exact
                                    to="/generalSettings"
                                    label={t(
                                        'pages_settings.scroll_area_box.navs.profile',
                                    )}
                                    icon={<MantineIcon icon={IconUserCircle} />}
                                />

                                {allowPasswordAuthentication && (
                                    <RouterNavLink
                                        label={
                                            hasSocialLogin
                                                ? t(
                                                      'pages_settings.scroll_area_box.navs.password.password_social_login',
                                                  )
                                                : t(
                                                      'pages_settings.scroll_area_box.navs.password.password',
                                                  )
                                        }
                                        exact
                                        to="/generalSettings/password"
                                        icon={<MantineIcon icon={IconLock} />}
                                    />
                                )}

                                {isPassthroughLoginFeatureEnabled && (
                                    <RouterNavLink
                                        label={t(
                                            'pages_settings.scroll_area_box.navs.warehouse_connections',
                                        )}
                                        exact
                                        to="/generalSettings/myWarehouseConnections"
                                        icon={
                                            <MantineIcon
                                                icon={IconDatabaseCog}
                                            />
                                        }
                                    />
                                )}
                                {user.ability.can(
                                    'manage',
                                    'PersonalAccessToken',
                                ) && (
                                    <RouterNavLink
                                        label={t(
                                            'pages_settings.scroll_area_box.navs.access_tokens',
                                        )}
                                        exact
                                        to="/generalSettings/personalAccessTokens"
                                        icon={<MantineIcon icon={IconKey} />}
                                    />
                                )}
                            </Box>

                            <Box>
                                <Title order={6} fw={600} mb="xs">
                                    {t(
                                        'pages_settings.scroll_area_box_create.title',
                                    )}
                                </Title>

                                {user.ability.can('manage', 'Organization') && (
                                    <RouterNavLink
                                        label={t(
                                            'pages_settings.scroll_area_box_create.navs.general',
                                        )}
                                        to="/generalSettings/organization"
                                        exact
                                        icon={
                                            <MantineIcon
                                                icon={IconBuildingSkyscraper}
                                            />
                                        }
                                    />
                                )}

                                {user.ability.can(
                                    'update',
                                    'OrganizationMemberProfile',
                                ) && (
                                    <RouterNavLink
                                        label={
                                            isGroupManagementEnabled
                                                ? t(
                                                      'pages_settings.scroll_area_box_create.navs.users.users_groups',
                                                  )
                                                : t(
                                                      'pages_settings.scroll_area_box_create.navs.users.user_management',
                                                  )
                                        }
                                        to="/generalSettings/userManagement"
                                        exact
                                        icon={
                                            <MantineIcon icon={IconUserPlus} />
                                        }
                                    />
                                )}
                                {user.ability.can(
                                    'manage',
                                    subject('Organization', {
                                        organizationUuid:
                                            organization.organizationUuid,
                                    }),
                                ) && (
                                    <RouterNavLink
                                        label={
                                            isGroupManagementEnabled
                                                ? t(
                                                      'pages_settings.scroll_area_box_create.navs.user_attributes.user_group_attributes',
                                                  )
                                                : t(
                                                      'pages_settings.scroll_area_box_create.navs.user_attributes.user_attributes',
                                                  )
                                        }
                                        to="/generalSettings/userAttributes"
                                        exact
                                        icon={
                                            <MantineIcon
                                                icon={IconUserShield}
                                            />
                                        }
                                    />
                                )}

                                {user.ability.can('update', 'Organization') && (
                                    <RouterNavLink
                                        label={t(
                                            'pages_settings.scroll_area_box_create.navs.appearance',
                                        )}
                                        exact
                                        to="/generalSettings/appearance"
                                        icon={
                                            <MantineIcon icon={IconPalette} />
                                        }
                                    />
                                )}

                                {user.ability.can('manage', 'Organization') && (
                                    <RouterNavLink
                                        label={t(
                                            'pages_settings.scroll_area_box_create.navs.integrations',
                                        )}
                                        exact
                                        to="/generalSettings/integrations"
                                        icon={<MantineIcon icon={IconPlug} />}
                                    />
                                )}

                                {user.ability.can('manage', 'Organization') &&
                                    aiCopilotFlag?.enabled && (
                                        <RouterNavLink
                                            label="AI Agents"
                                            exact
                                            to="/generalSettings/aiAgents"
                                            icon={
                                                <MantineIcon icon={IconBrain} />
                                            }
                                        />
                                    )}

                                {organization &&
                                    !organization.needsProject &&
                                    user.ability.can('view', 'Project') && (
                                        <RouterNavLink
                                            label={t(
                                                'pages_settings.scroll_area_box_create.navs.all_projects',
                                            )}
                                            to="/generalSettings/projectManagement"
                                            exact
                                            icon={
                                                <MantineIcon
                                                    icon={IconDatabase}
                                                />
                                            }
                                        />
                                    )}

                                {user.ability.can('manage', 'Organization') &&
                                    isScimTokenManagementEnabled?.enabled && (
                                        <RouterNavLink
                                            label="SCIM Access Tokens"
                                            exact
                                            to="/generalSettings/scimAccessTokens"
                                            icon={
                                                <MantineIcon icon={IconKey} />
                                            }
                                        />
                                    )}
                            </Box>

                            {organization &&
                            !organization.needsProject &&
                            project &&
                            user.ability.can(
                                'update',
                                subject('Project', {
                                    organizationUuid:
                                        organization.organizationUuid,
                                    projectUuid: project.projectUuid,
                                }),
                            ) ? (
                                <Box>
                                    <Title order={6} fw={600} mb="xs">
                                        {t(
                                            'pages_settings.scroll_area_box_update.title',
                                            {
                                                name: project?.name,
                                            },
                                        )}
                                    </Title>

                                    <RouterNavLink
                                        label={t(
                                            'pages_settings.scroll_area_box_update.navs.connection_settings',
                                        )}
                                        exact
                                        to={`/generalSettings/projectManagement/${project.projectUuid}/settings`}
                                        icon={
                                            <MantineIcon
                                                icon={IconDatabaseCog}
                                            />
                                        }
                                    />

                                    {user.ability?.can(
                                        'manage',
                                        subject('Project', {
                                            organizationUuid:
                                                project.organizationUuid,
                                            projectUuid: project.projectUuid,
                                        }),
                                    ) && isSemanticLayerEnabled ? (
                                        <RouterNavLink
                                            label={t(
                                                'pages_settings.scroll_area_box_update.navs.semantic_layer_integration',
                                            )}
                                            exact
                                            to={`/generalSettings/projectManagement/${project.projectUuid}/semanticLayer`}
                                            icon={
                                                <MantineIcon
                                                    icon={IconLayersLinked}
                                                />
                                            }
                                        />
                                    ) : null}

                                    <RouterNavLink
                                        label={t(
                                            'pages_settings.scroll_area_box_update.navs.tables_configuration',
                                        )}
                                        exact
                                        to={`/generalSettings/projectManagement/${project.projectUuid}/tablesConfiguration`}
                                        icon={
                                            <MantineIcon
                                                icon={IconTableOptions}
                                            />
                                        }
                                    />

                                    <RouterNavLink
                                        label={t(
                                            'pages_settings.scroll_area_box_update.navs.project_access',
                                        )}
                                        exact
                                        to={`/generalSettings/projectManagement/${project.projectUuid}/projectAccess`}
                                        icon={<MantineIcon icon={IconUsers} />}
                                    />

                                    {user.ability.can(
                                        'view',
                                        subject('Analytics', {
                                            organizationUuid:
                                                organization.organizationUuid,
                                            projectUuid: project.projectUuid,
                                        }),
                                    ) ? (
                                        <RouterNavLink
                                            label={t(
                                                'pages_settings.scroll_area_box_update.navs.usage_analytics',
                                            )}
                                            exact
                                            to={`/generalSettings/projectManagement/${project.projectUuid}/usageAnalytics`}
                                            onClick={() => {
                                                track({
                                                    name: EventName.USAGE_ANALYTICS_CLICKED,
                                                });
                                            }}
                                            icon={
                                                <MantineIcon
                                                    icon={IconReportAnalytics}
                                                />
                                            }
                                        />
                                    ) : null}

                                    <RouterNavLink
                                        label={t(
                                            'pages_settings.scroll_area_box_update.navs.syncs_scheduled_deliveries',
                                        )}
                                        exact
                                        to={`/generalSettings/projectManagement/${project.projectUuid}/scheduledDeliveries`}
                                        icon={
                                            <MantineIcon
                                                icon={IconCalendarStats}
                                            />
                                        }
                                    />

                                    {user.ability?.can(
                                        'update',
                                        subject('Project', {
                                            organizationUuid:
                                                project.organizationUuid,
                                            projectUuid: project.projectUuid,
                                        }),
                                    ) && embeddingEnabled?.enabled ? (
                                        <RouterNavLink
                                            label="Embed configuration"
                                            exact
                                            to={`/generalSettings/projectManagement/${project.projectUuid}/embed`}
                                            icon={
                                                <MantineIcon
                                                    icon={IconBrowser}
                                                />
                                            }
                                        />
                                    ) : null}

                                    {user.ability?.can(
                                        'manage',
                                        subject('Validation', {
                                            organizationUuid:
                                                project.organizationUuid,
                                            projectUuid: project.projectUuid,
                                        }),
                                    ) ? (
                                        <RouterNavLink
                                            label={t(
                                                'pages_settings.scroll_area_box_update.navs.validator',
                                            )}
                                            exact
                                            to={`/generalSettings/projectManagement/${project.projectUuid}/validator`}
                                            icon={
                                                <MantineIcon
                                                    icon={IconChecklist}
                                                />
                                            }
                                        />
                                    ) : null}

                                    {user.ability?.can(
                                        'promote',
                                        subject('SavedChart', {
                                            organizationUuid:
                                                project.organizationUuid,
                                            projectUuid: project.projectUuid,
                                        }),
                                    ) ? (
                                        <RouterNavLink
                                            label={t(
                                                'pages_settings.scroll_area_box_update.navs.data_ops',
                                            )}
                                            exact
                                            to={`/generalSettings/projectManagement/${project.projectUuid}/dataOps`}
                                            icon={
                                                <MantineIcon
                                                    icon={IconDatabaseExport}
                                                />
                                            }
                                        />
                                    ) : null}
                                </Box>
                            ) : null}
                        </Stack>
                    </ScrollArea>
                </Stack>
            }
        >
            {routeElements}
        </Page>
    );
};

export default Settings;
