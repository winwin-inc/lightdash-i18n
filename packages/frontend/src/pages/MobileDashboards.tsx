import {
    ResourceViewItemType,
    wrapResourceView,
    type ResourceViewItem,
} from '@lightdash/common';
import { ActionIcon, Group, Stack, TextInput } from '@mantine/core';
import { IconLayoutDashboard, IconSearch, IconX } from '@tabler/icons-react';
import Fuse from 'fuse.js';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';

import { useEffect } from 'react';
import LoadingState from '../components/common/LoadingState';
import MantineIcon from '../components/common/MantineIcon';
import PageBreadcrumbs from '../components/common/PageBreadcrumbs';
import ResourceView from '../components/common/ResourceView';
import { ResourceSortDirection } from '../components/common/ResourceView/types';
import { useDashboards } from '../hooks/dashboard/useDashboards';
import { useNavigate } from 'react-router';

const MobileDashboards = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { projectUuid } = useParams<{ projectUuid: string }>();
    
    const { isInitialLoading, data: dashboards = [], error } =
        useDashboards(projectUuid);
    const [search, setSearch] = useState<string>('');

    // Handle 403 Forbidden error - redirect to no permission page
    useEffect(() => {
        if (error?.error?.statusCode === 403) {
            navigate('/no-dashboard-access', { replace: true });
        }
    }, [error, navigate]);
    const visibleItems = useMemo(() => {
        const items = wrapResourceView(
            dashboards,
            ResourceViewItemType.DASHBOARD,
        );
        if (search && search !== '') {
            const matchingItems: ResourceViewItem[] = [];
            new Fuse(items, {
                keys: ['data.name'],
                ignoreLocation: true,
                threshold: 0.3,
            })
                .search(search)
                .forEach((res) => matchingItems.push(res.item));
            return matchingItems;
        }
        return items;
    }, [dashboards, search]);

    if (isInitialLoading) {
        return (
            <LoadingState
                title={t('pages_mobile_dashboards.loading_dashboards')}
            />
        );
    }

    return (
        <Stack spacing="md" m="lg">
            <Group position="apart">
                <PageBreadcrumbs
                    items={[
                        {
                            title: t(
                                'pages_mobile_dashboards.bread_crumbs.home',
                            ),
                            to: '/home',
                        },
                        {
                            title: t(
                                'pages_mobile_dashboards.bread_crumbs.all_dashboards',
                            ),
                            active: true,
                        },
                    ]}
                />
            </Group>
            <TextInput
                icon={<MantineIcon icon={IconSearch} />}
                rightSection={
                    search ? (
                        <ActionIcon onClick={() => setSearch('')}>
                            <MantineIcon icon={IconX} />
                        </ActionIcon>
                    ) : null
                }
                placeholder={t('pages_mobile_dashboards.search')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
            />
            <ResourceView
                items={visibleItems}
                listProps={{
                    defaultSort: { updatedAt: ResourceSortDirection.DESC },
                    defaultColumnVisibility: {
                        space: false,
                        updatedAt: false,
                        actions: false,
                    },
                }}
                emptyStateProps={{
                    icon: <IconLayoutDashboard size={30} />,
                    title: t('pages_mobile_dashboards.no_dashboards_added_yet'),
                }}
            />
        </Stack>
    );
};

export default MobileDashboards;
