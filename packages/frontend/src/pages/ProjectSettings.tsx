import { Stack } from '@mantine/core';
import { useMemo, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useParams, useRoutes, type RouteObject } from 'react-router';
import ErrorState from '../components/common/ErrorState';
import PageBreadcrumbs from '../components/common/PageBreadcrumbs';
import SuboptimalState from '../components/common/SuboptimalState/SuboptimalState';
import { DataOps } from '../components/DataOps';
import ProjectUserAccess from '../components/ProjectAccess';
import { UpdateProjectConnection } from '../components/ProjectConnection';
import ProjectTablesConfiguration from '../components/ProjectTablesConfiguration/ProjectTablesConfiguration';
import SettingsScheduler from '../components/SettingsScheduler';
import SettingsUsageAnalytics from '../components/SettingsUsageAnalytics';
import { SettingsValidator } from '../components/SettingsValidator';
import SettingsEmbed from '../ee/features/embed/SettingsEmbed';
import { useProject } from '../hooks/useProject';

const ProjectSettings: FC = () => {
    const { projectUuid } = useParams<{
        projectUuid: string;
    }>();
    const { t } = useTranslation();

    const { isInitialLoading, data: project, error } = useProject(projectUuid);

    const routes = useMemo<RouteObject[]>(() => {
        if (!projectUuid) {
            return [];
        }
        return [
            {
                path: `/settings`,
                element: <UpdateProjectConnection projectUuid={projectUuid} />,
            },
            {
                path: `/tablesConfiguration`,
                element: (
                    <ProjectTablesConfiguration projectUuid={projectUuid} />
                ),
            },
            {
                path: `/projectAccess`,
                element: <ProjectUserAccess projectUuid={projectUuid} />,
            },
            {
                path: `/usageAnalytics`,
                element: <SettingsUsageAnalytics projectUuid={projectUuid} />,
            },
            {
                path: `/scheduledDeliveries`,
                element: <SettingsScheduler projectUuid={projectUuid} />,
            },
            {
                path: `/validator`,
                element: <SettingsValidator projectUuid={projectUuid} />,
            },
            {
                path: `/dataOps`,
                element: <DataOps projectUuid={projectUuid} />,
            },
            {
                path: '*',
                element: <Navigate to={`/generalSettings`} />,
            },
            {
                path: '/embed', // commercial route
                element: <SettingsEmbed projectUuid={projectUuid} />,
            },
        ];
    }, [projectUuid]);
    const routesElements = useRoutes(routes);

    if (error) {
        return <ErrorState error={error.error} />;
    }

    if (isInitialLoading || !project || !projectUuid) {
        return (
            <div style={{ marginTop: '20px' }}>
                <SuboptimalState
                    title={t('pages_project_settings.loading_project')}
                    loading
                />
            </div>
        );
    }

    return (
        <>
            <title>{t('pages_project_settings.title')}</title>

            <Stack spacing="xl">
                <PageBreadcrumbs
                    items={[
                        {
                            title: t(
                                'pages_project_settings.bread_crumbs.all_projects',
                            ),
                            to: '/generalSettings/projectManagement',
                        },
                        {
                            title: project.name,
                            active: true,
                        },
                    ]}
                />
                {routesElements}
            </Stack>
        </>
    );
};

export default ProjectSettings;
