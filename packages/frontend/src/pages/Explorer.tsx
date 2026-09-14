import { subject } from '@casl/ability';
import { memo, useCallback } from 'react';
import { Provider } from 'react-redux';
import { useParams } from 'react-router';

import { useHotkeys } from '@mantine/hooks';
import { useTranslation } from 'react-i18next';

import Page from '../components/common/Page/Page';
import Explorer from '../components/Explorer';
import ExploreSideBar from '../components/Explorer/ExploreSideBar/index';
import ForbiddenPanel from '../components/ForbiddenPanel';
import {
    explorerStore,
    selectFromDashboard,
    selectTableName,
    useExplorerSelector,
} from '../features/explorer/store';
import { MergeProvider } from '../features/mergeQuery/context/MergeContext';
import { useMergeSafe } from '../features/mergeQuery/context/useMerge';
import { useExplore } from '../hooks/useExplore';
import { useExplorerQueryEffects } from '../hooks/useExplorerQueryEffects';
import {
    useExplorerRoute,
    useExplorerUrlState,
} from '../hooks/useExplorerRoute';
import { ProfilerWrapper } from '../perf/ProfilerWrapper';
import useApp from '../providers/App/useApp';
import { defaultState } from '../providers/Explorer/defaultState';
import ExplorerProvider from '../providers/Explorer/ExplorerProvider';
import useExplorerContext from '../providers/Explorer/useExplorerContext';

const ExplorerWithUrlParams = memo(() => {
    const { t } = useTranslation();

    // Run the query effects hook - orchestrates all query effects
    useExplorerQueryEffects();
    useExplorerRoute();

    // Get table name from Redux
    const tableId = useExplorerSelector(selectTableName);
    const fromDashboard = useExplorerSelector(selectFromDashboard);
    const { data } = useExplore(tableId, undefined, fromDashboard ?? undefined);

    const clearQuery = useExplorerContext(
        (context) => context.actions.clearQuery,
    );
    const merge = useMergeSafe();
    const handleClearQuery = useCallback(() => {
        merge?.additionalSources.forEach((source) =>
            merge.removeSource(source.id),
        );
        clearQuery();
    }, [merge, clearQuery]);
    useHotkeys([['mod + alt + k', handleClearQuery]]);

    return (
        <Page
            title={data ? data?.label : t('pages_explorer.tables')}
            sidebar={<ExploreSideBar />}
            withFullHeight
            withPaddedContent
        >
            <ProfilerWrapper id="Explorer">
                <Explorer />
            </ProfilerWrapper>
        </Page>
    );
});

const ExplorerWithMerge = memo(() => (
    <MergeProvider>
        <ExplorerWithUrlParams />
    </MergeProvider>
));

const ExplorerPage = memo(() => {
    const { projectUuid } = useParams<{ projectUuid: string }>();

    const explorerUrlState = useExplorerUrlState();
    const { user, health } = useApp();

    const cannotViewProject = user.data?.ability?.cannot(
        'view',
        subject('Project', {
            organizationUuid: user.data?.organizationUuid,
            projectUuid,
        }),
    );
    const cannotManageExplore = user.data?.ability?.cannot(
        'manage',
        subject('Explore', {
            organizationUuid: user.data?.organizationUuid,
            projectUuid,
        }),
    );

    if (cannotViewProject || cannotManageExplore) {
        return <ForbiddenPanel />;
    }

    return (
        <Provider store={explorerStore}>
            <ExplorerProvider
                isEditMode={true}
                initialState={
                    explorerUrlState
                        ? { ...explorerUrlState, isEditMode: true }
                        : { ...defaultState, isEditMode: true }
                }
                defaultLimit={health.data?.query.defaultLimit}
            >
                <ExplorerWithMerge />
            </ExplorerProvider>
        </Provider>
    );
});

export default ExplorerPage;
