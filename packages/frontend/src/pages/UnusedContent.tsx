import { type UnusedContentItem } from '@lightdash/common';
import {
    Anchor,
    Card,
    Group,
    Stack,
    Table,
    Text,
    Tooltip,
} from '@mantine/core';
import { IconArchive } from '@tabler/icons-react';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';

dayjs.extend(relativeTime);

import MantineIcon from '../components/common/MantineIcon';
import Page from '../components/common/Page/Page';
import PageBreadcrumbs from '../components/common/PageBreadcrumbs';
import SuboptimalState from '../components/common/SuboptimalState/SuboptimalState';
import ForbiddenPanel from '../components/ForbiddenPanel';
import { useUnusedContent } from '../hooks/analytics/useUserActivity';
import { useProject } from '../hooks/useProject';
import useApp from '../providers/App/useApp';

const VisualizationCard = ({
    children,
    description,
}: {
    children: React.ReactNode;
    description?: string;
}) => {
    return (
        <Card
            sx={{
                verticalAlign: 'middle',
                textAlign: 'center',
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

const UnusedContentTable: FC<{
    items: UnusedContentItem[];
    projectUuid: string;
    title: string;
}> = ({ items, projectUuid, title }) => {
    const { t } = useTranslation();

    const getRelativeTime = (date: Date | null) => {
        if (!date) return t('pages_unused_content.never_viewed');
        return dayjs(date).fromNow();
    };

    const getContentLink = (item: UnusedContentItem) => {
        const baseUrl = `/projects/${projectUuid}`;
        if (item.contentType === 'chart') {
            return `${baseUrl}/saved/${item.contentUuid}`;
        } else if (item.contentType === 'dashboard') {
            return `${baseUrl}/dashboards/${item.contentUuid}`;
        }
        return '#';
    };

    if (items.length === 0) {
        return (
            <VisualizationCard description={title}>
                <SuboptimalState
                    title={t('pages_unused_content.no_content_found.title')}
                    description={t(
                        'pages_unused_content.no_content_found.description',
                    )}
                />
            </VisualizationCard>
        );
    }

    return (
        <VisualizationCard description={title}>
            <Table withColumnBorders ta="left">
                <thead>
                    <tr>
                        <th>{t('pages_unused_content.name')}</th>
                        <th>{t('pages_unused_content.views')}</th>
                        <th>{t('pages_unused_content.last_viewed')}</th>
                        <th>{t('pages_unused_content.created_by')}</th>
                    </tr>
                </thead>
                <tbody>
                    {items.map((item) => (
                        <tr key={`${item.contentType}-${item.contentUuid}`}>
                            <td>
                                <Anchor
                                    href={getContentLink(item)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                >
                                    {item.contentName}
                                </Anchor>
                            </td>
                            <td>{item.viewsCount}</td>
                            <td>
                                {item.lastViewedAt ? (
                                    <Tooltip
                                        label={dayjs(item.lastViewedAt).format(
                                            'MMM DD, YYYY HH:mm:ss',
                                        )}
                                        position="top"
                                        withArrow
                                    >
                                        <span style={{ cursor: 'help' }}>
                                            {getRelativeTime(item.lastViewedAt)}
                                        </span>
                                    </Tooltip>
                                ) : (
                                    t('pages_unused_content.never_viewed')
                                )}
                            </td>
                            <td>{item.createdByUserName}</td>
                        </tr>
                    ))}
                </tbody>
            </Table>
        </VisualizationCard>
    );
};

const UnusedContent: FC = () => {
    const { t } = useTranslation();

    const params = useParams<{ projectUuid: string }>();
    const { data: project } = useProject(params.projectUuid);
    const { user: sessionUser } = useApp();

    const { data: unusedContent, isInitialLoading } = useUnusedContent(
        params.projectUuid,
    );

    if (sessionUser.data?.ability?.cannot('view', 'Analytics')) {
        return <ForbiddenPanel />;
    }

    if (isInitialLoading || unusedContent === undefined) {
        return (
            <div style={{ marginTop: '20px' }}>
                <SuboptimalState
                    title={t('pages_unused_content.loading')}
                    loading
                />
            </div>
        );
    }

    return (
        <Page
            title={t('pages_unused_content.least_viewed_content', {
                projectName: project?.name,
            })}
            withFitContent
        >
            <Group mt={10} mb={30} position="apart">
                <PageBreadcrumbs
                    items={[
                        {
                            title: t('pages_unused_content.usage_analytics'),
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
                                    <MantineIcon icon={IconArchive} size={20} />
                                    {t(
                                        'pages_unused_content.least_viewed_content',
                                        {
                                            projectName: project?.name,
                                        },
                                    )}
                                </Group>
                            ),
                            active: true,
                        },
                    ]}
                />
            </Group>

            <Stack spacing="lg">
                <Text size="sm" color="dimmed">
                    {t('pages_unused_content.tip')}
                </Text>

                <UnusedContentTable
                    items={unusedContent.charts}
                    projectUuid={params.projectUuid!}
                    title={t('pages_unused_content.least_viewed_charts')}
                />

                <UnusedContentTable
                    items={unusedContent.dashboards}
                    projectUuid={params.projectUuid!}
                    title={t('pages_unused_content.least_viewed_dashboards')}
                />
            </Stack>
        </Page>
    );
};

export default UnusedContent;
