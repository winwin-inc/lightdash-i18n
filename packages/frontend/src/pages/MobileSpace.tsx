import {
    ResourceViewItemType,
    wrapResourceView,
    type ResourceViewItem,
} from '@lightdash/common';
import { ActionIcon, Group, Stack, TextInput } from '@mantine/core';
import { IconLayoutDashboard, IconSearch, IconX } from '@tabler/icons-react';
import Fuse from 'fuse.js';
import { useMemo, useState, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';
import ErrorState from '../components/common/ErrorState';
import LoadingState from '../components/common/LoadingState';
import MantineIcon from '../components/common/MantineIcon';
import PageBreadcrumbs from '../components/common/PageBreadcrumbs';
import ResourceView from '../components/common/ResourceView';
import { ResourceSortDirection } from '../components/common/ResourceView/types';
import SuboptimalState from '../components/common/SuboptimalState/SuboptimalState';
import ForbiddenPanel from '../components/ForbiddenPanel';
import { useSpace } from '../hooks/useSpaces';
import useApp from '../providers/App/useApp';

const MobileSpace: FC = () => {
    const { t } = useTranslation();
    const { projectUuid, spaceUuid } = useParams<{
        projectUuid: string;
        spaceUuid: string;
    }>();
    const {
        data: space,
        isInitialLoading,
        error,
    } = useSpace(projectUuid, spaceUuid);
    const { user } = useApp();
    const [search, setSearch] = useState<string>('');
    const visibleItems = useMemo(() => {
        const dashboardsInSpace = space?.dashboards || [];
        const chartsInSpace = space?.queries || [];
        const allItems = [
            ...wrapResourceView(
                dashboardsInSpace,
                ResourceViewItemType.DASHBOARD,
            ),
            ...wrapResourceView(chartsInSpace, ResourceViewItemType.CHART),
        ];
        if (search && search !== '') {
            const matchingItems: ResourceViewItem[] = [];
            new Fuse(allItems, {
                keys: ['data.name'],
                ignoreLocation: true,
                threshold: 0.3,
            })
                .search(search)
                .forEach((res) => matchingItems.push(res.item));
            return matchingItems;
        }
        return allItems;
    }, [space, search]);

    if (user.data?.ability?.cannot('view', 'SavedChart')) {
        return <ForbiddenPanel />;
    }

    if (isInitialLoading) {
        return <LoadingState title={t('pages_mobile_space.loading_space')} />;
    }

    if (error) {
        return <ErrorState error={error.error} />;
    }

    if (space === undefined) {
        return (
            <div style={{ marginTop: '20px' }}>
                <SuboptimalState
                    title={t('pages_mobile_space.no_space.title')}
                    description={t('pages_mobile_space.no_space.description', {
                        spaceUuid,
                    })}
                />
            </div>
        );
    }

    return (
        <Stack spacing="md" m="lg">
            <Group position="apart">
                <PageBreadcrumbs
                    items={[
                        {
                            title: t('pages_mobile_space.bread_crumbs.spaces', {
                                spaceUuid,
                            }),
                            to: `/projects/${projectUuid}/spaces`,
                        },
                        {
                            title: space.name,
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
                placeholder={t('pages_mobile_space.search')}
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
                    title: t('pages_mobile_space.empty'),
                }}
            />
        </Stack>
    );
};

export default MobileSpace;
