import {
    type ActivityViews,
    type UserActivity as UserActivityResponse,
    type UserWithCount,
} from '@lightdash/common';
import {
    Box,
    Button,
    Card,
    Group,
    Stack,
    Table,
    Text,
    Title,
    Tooltip,
} from '@mantine/core';
import { IconUsers } from '@tabler/icons-react';
import EChartsReact from 'echarts-for-react';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';

import MantineIcon from '../components/common/MantineIcon';
import Page from '../components/common/Page/Page';
import PageBreadcrumbs from '../components/common/PageBreadcrumbs';
import SuboptimalState from '../components/common/SuboptimalState/SuboptimalState';
import ForbiddenPanel from '../components/ForbiddenPanel';
import {
    useDownloadUserActivityCsv,
    useUserActivity,
} from '../hooks/analytics/useUserActivity';
import useHealth from '../hooks/health/useHealth';
import { useProject } from '../hooks/useProject';
import useApp from '../providers/App/useApp';

const VisualizationCard = ({
    grid,
    description,
    children,
}: {
    grid: string;
    description?: string;
    children: React.ReactNode;
}) => {
    return (
        <Card
            sx={{
                verticalAlign: 'middle',
                textAlign: 'center',
                gridArea: grid,
                overflow: 'auto',
            }}
            withBorder
        >
            <Text sx={{ float: 'left' }} fw={600} mb={10}>
                {description}
            </Text>
            {children}
        </Card>
    );
};

const BigNumberVis: FC<{ value: number | string; label: string }> = ({
    value,
    label,
}) => {
    return (
        <Stack h="100%" justify="center" spacing={0}>
            <Title order={1} size={56} fw={500}>
                {value}
            </Title>
            <Title order={4} fw={500} color="gray">
                {label}
            </Title>
        </Stack>
    );
};

const showTableViews = (key: string, views: ActivityViews[]) => {
    return (
        <tbody>
            {views.map((view) => {
                return (
                    <tr key={`${key}-${view.uuid}`}>
                        <td>{view.name}</td>
                        <td>{view.count}</td>
                    </tr>
                );
            })}
        </tbody>
    );
};

const showTableBodyWithUsers = (key: string, userList: UserWithCount[]) => {
    return (
        <tbody>
            {userList.map((user) => {
                return (
                    <tr key={`${key}-${user.userUuid}`}>
                        <td>{user.firstName} </td>
                        <td>{user.lastName}</td>
                        <td>{user.count}</td>
                    </tr>
                );
            })}
        </tbody>
    );
};

const useChartWeeklyQueryingUsers = () => {
    const { t } = useTranslation();

    return (data: UserActivityResponse['chartWeeklyQueryingUsers']) => ({
        grid: {
            height: '250px',
            top: '90',
        },
        xAxis: {
            type: 'time',
        },
        yAxis: [
            {
                type: 'value',
                name: t('pages_user_activity.chart_weekly.num_users'),
                nameLocation: 'center',
                nameGap: '40',
            },
            {
                type: 'value',
                name: t('pages_user_activity.chart_weekly.users'),
                nameLocation: 'center',
                nameGap: '40',
                nameRotate: -90,
            },
        ],
        legend: { top: '40' },
        series: [
            {
                name: t(
                    'pages_user_activity.chart_weekly.number_of_querying_users',
                ),
                data: data.map((queries: any) => [
                    queries.date,
                    queries.num_7d_active_users,
                ]),
                type: 'bar',
                color: '#d7c1fa',
            },
            {
                name: t('pages_user_activity.chart_weekly.querying_users'),
                yAxisIndex: 1,
                data: data.map((queries: any) => [
                    queries.date,
                    queries.percent_7d_active_users,
                ]),
                type: 'line',
                symbol: 'none',
                smooth: true,
                color: '#7262ff',
            },
        ],
    });
};

const useChartWeeklyAverageQueries = () => {
    const { t } = useTranslation();

    return (data: UserActivityResponse['chartWeeklyAverageQueries']) => ({
        grid: {
            height: '280px',
        },
        xAxis: {
            type: 'time',
        },
        yAxis: {
            type: 'value',
            name: t('pages_user_activity.chart_weekly.weekly_average'),
            nameLocation: 'center',
            nameGap: '25',
        },
        series: [
            {
                data: data.map((queries) => [
                    queries.date,
                    queries.average_number_of_weekly_queries_per_user,
                ]),
                type: 'line',
                symbol: 'none',
                smooth: true,
                color: '#16df95',
            },
        ],
    });
};

const UserActivity: FC = () => {
    const params = useParams<{ projectUuid: string }>();
    const { data: project } = useProject(params.projectUuid);
    const { user: sessionUser } = useApp();
    const { data: health } = useHealth();
    const { mutateAsync: downloadCsv, isLoading: isDownloadingCsv } =
        useDownloadUserActivityCsv();

    const { t } = useTranslation();
    const chartWeeklyQueryingUsers = useChartWeeklyQueryingUsers();
    const chartWeeklyAverageQueries = useChartWeeklyAverageQueries();

    const { data, isInitialLoading } = useUserActivity(params.projectUuid);
    if (sessionUser.data?.ability?.cannot('view', 'Analytics')) {
        return <ForbiddenPanel />;
    }

    if (isInitialLoading || data === undefined) {
        return (
            <div style={{ marginTop: '20px' }}>
                <SuboptimalState
                    title={t('pages_user_activity.loading')}
                    loading
                />
            </div>
        );
    }

    return (
        <Page title={`User activity for ${project?.name}`} withFitContent>
            <Group mt={10} mb={30} position="apart">
                <PageBreadcrumbs
                    items={[
                        {
                            title: t(
                                'pages_user_activity.items.usage_analytics',
                            ),
                            to: `/generalSettings/projectManagement/${params.projectUuid}/usageAnalytics`,
                        },
                        {
                            title: (
                                <Group
                                    style={{
                                        display: 'flex',
                                        gap: 6,
                                        alignItems: 'center',
                                    }}
                                >
                                    <MantineIcon icon={IconUsers} size={20} />{' '}
                                    {t(
                                        'pages_user_activity.items.user_activity',
                                        {
                                            name: project?.name,
                                        },
                                    )}
                                </Group>
                            ),
                            active: true,
                        },
                    ]}
                />
                <Tooltip label="Export raw chart and dashboard user views in a CSV format">
                    <Button
                        variant="outline"
                        disabled={isDownloadingCsv}
                        onClick={() => {
                            if (params.projectUuid)
                                downloadCsv(params.projectUuid)
                                    .then((url) => {
                                        if (url) {
                                            // If the file takes a while to download,
                                            // The browser might block the download when using window.open
                                            // For that we need to create a link and click it
                                            const link =
                                                document.createElement('a');
                                            link.href = url;
                                            document.body.appendChild(link);
                                            link.click();
                                            document.body.removeChild(link);
                                        }
                                    })
                                    .catch(console.error);
                        }}
                    >
                        {isDownloadingCsv ? 'Exporting...' : 'Export CSV'}
                    </Button>
                </Tooltip>
            </Group>
            <Box
                sx={{
                    display: 'grid',
                    gridTemplateColumns: '300px 300px 300px 300px',
                    gridTemplateRows: '200px 200px 400px 400px 400px 400px',
                    gap: '10px 10px',
                    gridTemplateAreas: `
                     'total-users total-users weekly-active weekly-active'
                     'viewers interactive-viewers editors admins '
                     'chart-active-users chart-active-users queries-per-user queries-per-user'
                     'table-most-queries table-most-queries table-most-charts table-most-charts'
                     'table-not-logged-in table-not-logged-in table-most-viewed table-most-viewed'
                     'table-dashboard-views table-dashboard-views table-chart-views table-chart-views'`,
                }}
            >
                <VisualizationCard grid="total-users">
                    <BigNumberVis
                        value={data.numberUsers}
                        label={t('pages_user_activity.total_users')}
                    />
                </VisualizationCard>
                <VisualizationCard grid="viewers">
                    <BigNumberVis
                        value={data.numberViewers}
                        label={t('pages_user_activity.numbers_of_viewers')}
                    />
                </VisualizationCard>
                <VisualizationCard grid="interactive-viewers">
                    <BigNumberVis
                        value={data.numberInteractiveViewers}
                        label={t(
                            'pages_user_activity.numbers_of_interactive_viewers',
                        )}
                    />
                </VisualizationCard>
                <VisualizationCard grid="editors">
                    <BigNumberVis
                        value={data.numberEditors}
                        label={t('pages_user_activity.numbers_of_editors')}
                    />
                </VisualizationCard>

                <VisualizationCard grid="admins">
                    <BigNumberVis
                        value={data.numberAdmins}
                        label={t('pages_user_activity.numbers_of_admins')}
                    />
                </VisualizationCard>
                <VisualizationCard grid="weekly-active">
                    <BigNumberVis
                        value={`${data.numberWeeklyQueryingUsers}%`}
                        label={t('pages_user_activity.users_viewd')}
                    />
                </VisualizationCard>

                <VisualizationCard
                    grid="chart-active-users"
                    description={t('pages_user_activity.users_query')}
                >
                    <EChartsReact
                        style={{ height: '100%' }}
                        notMerge
                        option={chartWeeklyQueryingUsers(
                            data.chartWeeklyQueryingUsers,
                        )}
                    />
                </VisualizationCard>

                <VisualizationCard
                    grid="queries-per-user"
                    description={t('pages_user_activity.users_running')}
                >
                    <EChartsReact
                        style={{ height: '100%' }}
                        notMerge
                        option={chartWeeklyAverageQueries(
                            data.chartWeeklyAverageQueries,
                        )}
                    />
                </VisualizationCard>

                <VisualizationCard
                    grid="table-most-queries"
                    description={t('pages_user_activity.most_queries')}
                >
                    <Table withColumnBorders ta="left">
                        <thead>
                            <tr>
                                <th>
                                    {t(
                                        'pages_user_activity.table_columns.first_name',
                                    )}
                                </th>
                                <th>
                                    {t(
                                        'pages_user_activity.table_columns.last_name',
                                    )}
                                </th>
                                <th>
                                    {t(
                                        'pages_user_activity.table_columns.number_of_chart_updates',
                                    )}
                                </th>
                            </tr>
                        </thead>
                        {showTableBodyWithUsers(
                            'users-most-queries',
                            data.tableMostQueries,
                        )}
                    </Table>
                </VisualizationCard>
                <VisualizationCard
                    grid="table-most-charts"
                    description={t('pages_user_activity.most_updates_charts')}
                >
                    <Table withColumnBorders ta="left">
                        <thead>
                            <tr>
                                <th>
                                    {t(
                                        'pages_user_activity.table_columns.first_name',
                                    )}
                                </th>
                                <th>
                                    {t(
                                        'pages_user_activity.table_columns.last_name',
                                    )}
                                </th>
                                <th>
                                    {t(
                                        'pages_user_activity.table_columns.number_of_chart_updates',
                                    )}
                                </th>
                            </tr>
                        </thead>
                        {showTableBodyWithUsers(
                            'users-created-most-charts',
                            data.tableMostCreatedCharts,
                        )}
                    </Table>
                </VisualizationCard>
                <VisualizationCard
                    grid="table-not-logged-in"
                    description={t('pages_user_activity.run_queries_90_days')}
                >
                    <Table withColumnBorders ta="left">
                        <thead>
                            <tr>
                                <th>
                                    {t(
                                        'pages_user_activity.table_columns.first_name',
                                    )}
                                </th>
                                <th>
                                    {t(
                                        'pages_user_activity.table_columns.last_name',
                                    )}
                                </th>
                                <th>
                                    {t(
                                        'pages_user_activity.table_columns.days_since_last_query',
                                    )}
                                </th>
                            </tr>
                        </thead>
                        {showTableBodyWithUsers(
                            'users-not-logged-in',
                            data.tableNoQueries,
                        )}
                    </Table>
                </VisualizationCard>

                <VisualizationCard
                    grid="table-most-viewed"
                    description={t(
                        'pages_user_activity.users_most_viewed_dashboard',
                    )}
                >
                    <Table withColumnBorders ta="left">
                        <thead>
                            <tr>
                                <th>
                                    {t(
                                        'pages_user_activity.table_columns.first_name',
                                    )}
                                </th>
                                <th>
                                    {t(
                                        'pages_user_activity.table_columns.last_name',
                                    )}
                                </th>
                                <th>
                                    {t(
                                        'pages_user_activity.table_columns.dashboard_name',
                                    )}
                                </th>
                                <th>
                                    {t(
                                        'pages_user_activity.table_columns.views',
                                    )}
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.userMostViewedDashboards.map((user) => {
                                return (
                                    <tr
                                        key={`user-most-viewed-${user.userUuid}`}
                                    >
                                        <td>{user.firstName} </td>
                                        <td>{user.lastName}</td>
                                        <td>{user.dashboardName}</td>

                                        <td>{user.count}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </Table>
                </VisualizationCard>
                {health?.hasExtendedUsageAnalytics ? (
                    <>
                        <VisualizationCard
                            grid="table-dashboard-views"
                            description={t(
                                'pages_user_activity.dashboard_views_top_20',
                            )}
                        >
                            <Table withColumnBorders ta="left">
                                <thead>
                                    <tr>
                                        <th>
                                            {t(
                                                'pages_user_activity.table_columns.dashboard_name',
                                            )}
                                        </th>
                                        <th>
                                            {t(
                                                'pages_user_activity.table_columns.views',
                                            )}
                                        </th>
                                    </tr>
                                </thead>
                                {showTableViews(
                                    'dashboard-views',
                                    data.dashboardViews,
                                )}
                            </Table>
                        </VisualizationCard>
                        <VisualizationCard
                            grid="table-chart-views"
                            description={t(
                                'pages_user_activity.charts_views_top_20',
                            )}
                        >
                            <Table withColumnBorders ta="left">
                                <thead>
                                    <tr>
                                        <th>
                                            {t(
                                                'pages_user_activity.table_columns.chart_name',
                                            )}
                                        </th>
                                        <th>
                                            {t(
                                                'pages_user_activity.table_columns.views',
                                            )}
                                        </th>
                                    </tr>
                                </thead>
                                {showTableViews('chart-views', data.chartViews)}
                            </Table>
                        </VisualizationCard>
                    </>
                ) : null}
            </Box>
        </Page>
    );
};

export default UserActivity;
