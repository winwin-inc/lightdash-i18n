import { subject } from '@casl/ability';
import { ExploreType, type SummaryExplore } from '@lightdash/common';
import {
    ActionIcon,
    Skeleton,
    Stack,
    TextInput,
} from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import {
    IconAlertCircle,
    IconAlertTriangle,
    IconSearch,
    IconX,
} from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import Fuse from 'fuse.js';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router';

import {
    explorerActions,
    selectTableName,
    useExplorerDispatch,
    useExplorerSelector,
} from '../../../features/explorer/store';
import { useOrganization } from '../../../hooks/organization/useOrganization';
import { useExplores } from '../../../hooks/useExplores';
import { useProjectTableGroups } from '../../../hooks/useProjectTableGroups';
import { useProjectUuid } from '../../../hooks/useProjectUuid';
import useSearchParams from '../../../hooks/useSearchParams';
import { Can } from '../../../providers/Ability';
import { useAbilityContext } from '../../../providers/Ability/useAbilityContext';
import { defaultState } from '../../../providers/Explorer/defaultState';
import { TrackSection } from '../../../providers/Tracking/TrackingProvider';
import { SectionName } from '../../../types/Events';
import MantineIcon from '../../common/MantineIcon';
import PageBreadcrumbs from '../../common/PageBreadcrumbs';
import SuboptimalState from '../../common/SuboptimalState/SuboptimalState';
import ExplorePanel from '../ExplorePanel';
import { ItemDetailProvider } from '../ExploreTree/TableTree/ItemDetailProvider';
import { buildExploreTree, sortExploreTree } from './exploreTree';
import VirtualizedExploreList from './VirtualizedExploreList';

const LoadingSkeleton = () => (
    <Stack>
        <Skeleton h="md" />

        <Skeleton h="xxl" />

        <Stack spacing="xxs">
            {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((index) => (
                <Skeleton key={index} h="xxl" />
            ))}
        </Stack>
    </Stack>
);

const exploreHasGroups = (explore: SummaryExplore): boolean =>
    !!(explore.groups && explore.groups.length > 0) || !!explore.groupLabel;

const BasePanel = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const projectUuid = useProjectUuid();
    const searchFromUrl = useSearchParams('search') ?? '';
    const [search, setSearch] = useState(searchFromUrl);
    const [debouncedSearch] = useDebouncedValue(search, 300);
    const exploresResult = useExplores(projectUuid, true);
    const tableGroupsResult = useProjectTableGroups(projectUuid);
    const { data: org } = useOrganization();

    const { t } = useTranslation();

    // Restore from URL when returning to the list (or browser back)
    useEffect(() => {
        setSearch(searchFromUrl);
    }, [searchFromUrl]);

    // Persist to URL without interrupting IME (local state drives the input)
    useEffect(() => {
        const params = new URLSearchParams(location.search);
        if (debouncedSearch) {
            params.set('search', debouncedSearch);
        } else {
            params.delete('search');
        }
        const nextSearch = params.toString();
        if (nextSearch === new URLSearchParams(location.search).toString()) {
            return;
        }
        void navigate(
            {
                pathname: location.pathname,
                search: nextSearch,
            },
            { replace: true },
        );
    }, [debouncedSearch, location.pathname, location.search, navigate]);

    const navigateToTable = useCallback(
        (explore: SummaryExplore) => {
            const params = new URLSearchParams(location.search);
            if (search) {
                params.set('search', search);
            } else {
                params.delete('search');
            }
            void navigate({
                pathname: `/projects/${projectUuid}/tables/${explore.name}`,
                search: params.toString(),
            });
        },
        [location.search, navigate, projectUuid, search],
    );

    const filteredExplores = useMemo(() => {
        const validSearch = debouncedSearch
            ? debouncedSearch.toLowerCase()
            : '';
        if (exploresResult.data) {
            let explores = Object.values(exploresResult.data);
            if (validSearch !== '') {
                explores = new Fuse(Object.values(exploresResult.data), {
                    keys: [
                        { name: 'label', weight: 2 },
                        { name: 'name', weight: 2 },
                        { name: 'groupLabel', weight: 1 },
                        { name: 'groups', weight: 1 },
                    ],
                    ignoreLocation: true,
                    threshold: 0.3,
                })
                    .search(validSearch)
                    .map((res) => res.item);
            }
            return explores;
        }
        return undefined;
    }, [exploresResult.data, debouncedSearch]);

    const tableGroupDetails = useMemo(
        () => tableGroupsResult.data ?? {},
        [tableGroupsResult.data],
    );

    const [groupedExploreTree, defaultUngroupedExplores, customUngroupedExplores] =
        useMemo(() => {
            if (!filteredExplores) {
                return [[], [] as SummaryExplore[], [] as SummaryExplore[]];
            }

            const groupedExplores: SummaryExplore[] = [];
            const defaultExplores: SummaryExplore[] = [];
            const customExplores: SummaryExplore[] = [];

            for (const explore of filteredExplores) {
                if (exploreHasGroups(explore)) {
                    groupedExplores.push(explore);
                } else if (explore.type === ExploreType.VIRTUAL) {
                    customExplores.push(explore);
                } else {
                    defaultExplores.push(explore);
                }
            }

            const tree = sortExploreTree(
                buildExploreTree(groupedExplores, tableGroupDetails),
            );

            defaultExplores.sort((a, b) => a.label.localeCompare(b.label));
            customExplores.sort((a, b) => a.label.localeCompare(b.label));

            return [tree, defaultExplores, customExplores];
        }, [filteredExplores, tableGroupDetails]);

    const virtualViewsSectionLabel = t(
        'components_explorer_sider_bar.virtual_views',
    );

    if (exploresResult.status === 'loading') {
        return <LoadingSkeleton />;
    }

    if (exploresResult.status === 'error') {
        return (
            <SuboptimalState
                icon={IconAlertCircle}
                title={t('components_explorer_sider_bar.error')}
            />
        );
    }

    if (exploresResult.data) {
        return (
            <>
                <ItemDetailProvider>
                    <Stack h="100%" sx={{ flexGrow: 1 }}>
                        <Can
                            I="manage"
                            this={subject('Explore', {
                                organizationUuid: org?.organizationUuid,
                                projectUuid,
                            })}
                        >
                            <PageBreadcrumbs
                                size="md"
                                items={[
                                    {
                                        title: t(
                                            'components_explorer_sider_bar.title',
                                        ),
                                        active: true,
                                    },
                                ]}
                            />
                        </Can>

                        <TextInput
                            icon={<MantineIcon icon={IconSearch} />}
                            rightSection={
                                search ? (
                                    <ActionIcon onClick={() => setSearch('')}>
                                        <MantineIcon icon={IconX} />
                                    </ActionIcon>
                                ) : null
                            }
                            placeholder={t(
                                'components_explorer_sider_bar.search_tables',
                            )}
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />

                        <VirtualizedExploreList
                            groupedExploreTree={groupedExploreTree}
                            defaultUngroupedExplores={defaultUngroupedExplores}
                            customUngroupedExplores={customUngroupedExplores}
                            virtualViewsSectionLabel={virtualViewsSectionLabel}
                            searchQuery={debouncedSearch}
                            onExploreClick={navigateToTable}
                        />
                    </Stack>
                </ItemDetailProvider>
            </>
        );
    }

    return (
        <SuboptimalState
            icon={IconAlertTriangle}
            title={t('components_explorer_sider_bar.error')}
        />
    );
};

const ExploreSideBar = memo(() => {
    const projectUuid = useProjectUuid();

    const tableName = useExplorerSelector(selectTableName);
    const ability = useAbilityContext();
    const { data: org } = useOrganization();

    const queryClient = useQueryClient();
    const dispatch = useExplorerDispatch();
    const navigate = useNavigate();
    const location = useLocation();

    const clearExplore = useCallback(async () => {
        void queryClient.cancelQueries({
            queryKey: ['create-query'],
            exact: false,
        });
        dispatch(explorerActions.reset(defaultState));
        dispatch(explorerActions.resetQueryExecution());
    }, [queryClient, dispatch]);

    const canManageExplore = ability.can(
        'manage',
        subject('Explore', {
            organizationUuid: org?.organizationUuid,
            projectUuid,
        }),
    );
    const handleBack = useCallback(() => {
        void clearExplore();
        void navigate({
            pathname: `/projects/${projectUuid}/tables`,
            search: location.search,
        });
    }, [clearExplore, location.search, navigate, projectUuid]);

    return (
        <TrackSection name={SectionName.SIDEBAR}>
            {!tableName ? (
                <BasePanel />
            ) : (
                <ExplorePanel
                    onBack={canManageExplore ? handleBack : undefined}
                />
            )}
        </TrackSection>
    );
});

ExploreSideBar.displayName = 'ExploreSideBar';

export default ExploreSideBar;
