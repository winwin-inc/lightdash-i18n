import { subject } from '@casl/ability';
import {
    ActionIcon,
    CopyButton,
    Group,
    SegmentedControl,
    Skeleton,
    Tooltip,
} from '@mantine/core';
import { useHover } from '@mantine/hooks';
import { IconCheck, IconClipboard } from '@tabler/icons-react';
import {
    lazy,
    memo,
    Suspense,
    useCallback,
    useMemo,
    useState,
    type FC,
} from 'react';
import { useTranslation } from 'react-i18next';

import {
    explorerActions,
    selectFromDashboard,
    selectIsSqlExpanded,
    selectMetricQuery,
    selectTableName,
    useExplorerDispatch,
    useExplorerSelector,
} from '../../../features/explorer/store';
import { useCompiledSql } from '../../../hooks/useCompiledSql';
import { Can } from '../../../providers/Ability';
import useApp from '../../../providers/App/useApp';
import { ExplorerSection } from '../../../providers/Explorer/types';
import CollapsableCard from '../../common/CollapsableCard/CollapsableCard';
import MantineIcon from '../../common/MantineIcon';
import { buildSemanticQueryJson } from './buildSemanticQueryJson';
import OpenInSqlRunnerButton from './OpenInSqlRunnerButton';

interface SqlCardProps {
    projectUuid: string;
}

type QueryView = 'sql' | 'metricQuery';

const LazyRenderedSql = lazy(() =>
    import('../../RenderedSql').then((module) => ({
        default: module.RenderedSql,
    })),
);

const LazyRenderedMetricQuery = lazy(() =>
    import('../../RenderedMetricQuery').then((module) => ({
        default: module.RenderedMetricQuery,
    })),
);

const SqlCard: FC<SqlCardProps> = memo(({ projectUuid }) => {
    const { t } = useTranslation();
    const { hovered, ref: headingRef } = useHover();
    const [queryView, setQueryView] = useState<QueryView>('sql');

    const sqlIsOpen = useExplorerSelector(selectIsSqlExpanded);
    const dispatch = useExplorerDispatch();
    const tableName = useExplorerSelector(selectTableName);
    const metricQuery = useExplorerSelector(selectMetricQuery);
    const fromDashboard = useExplorerSelector(selectFromDashboard);

    const toggleExpandedSection = useCallback(
        (section: ExplorerSection) => {
            dispatch(explorerActions.toggleExpandedSection(section));
        },
        [dispatch],
    );
    const { user } = useApp();

    const { data, isSuccess } = useCompiledSql({
        enabled: !!tableName && queryView === 'sql',
    });

    const metricQueryJson = useMemo(() => {
        if (!tableName) return '';
        return buildSemanticQueryJson(metricQuery, fromDashboard);
    }, [metricQuery, tableName, fromDashboard]);

    const copyValue =
        queryView === 'sql' ? (data?.query ?? '') : metricQueryJson;

    const canCopy =
        queryView === 'sql'
            ? !!(data && isSuccess && data.query)
            : metricQueryJson.length > 0;

    const copyLabel =
        queryView === 'sql'
            ? t('components_explorer_sql_card.copy_sql')
            : t('components_explorer_sql_card.copy_metric_query');

    return (
        <CollapsableCard
            isVisualizationCard
            headingRef={headingRef}
            title={t('components_explorer_sql_card.query_title')}
            isOpen={sqlIsOpen}
            onToggle={() => toggleExpandedSection(ExplorerSection.SQL)}
            disabled={!tableName}
            headerElement={
                <Group spacing="xs">
                    {sqlIsOpen ? (
                        <SegmentedControl
                            size="xs"
                            value={queryView}
                            onChange={(value) =>
                                setQueryView(value as QueryView)
                            }
                            data={[
                                {
                                    label: t(
                                        'components_explorer_sql_card.tab_sql',
                                    ),
                                    value: 'sql',
                                },
                                {
                                    label: t(
                                        'components_explorer_sql_card.tab_metric_query',
                                    ),
                                    value: 'metricQuery',
                                },
                            ]}
                        />
                    ) : null}
                    {(hovered || sqlIsOpen) && canCopy ? (
                        <CopyButton value={copyValue} timeout={2000}>
                            {({ copied, copy }) => (
                                <Tooltip
                                    variant="xs"
                                    label={
                                        copied
                                            ? t(
                                                  'components_explorer_sql_card.copied_to_clipboard',
                                              )
                                            : copyLabel
                                    }
                                    withArrow
                                    position="right"
                                    color={copied ? 'green' : 'dark'}
                                    fw={500}
                                >
                                    <ActionIcon
                                        color={copied ? 'teal' : 'gray'}
                                        onClick={copy}
                                    >
                                        <MantineIcon
                                            icon={
                                                copied
                                                    ? IconCheck
                                                    : IconClipboard
                                            }
                                        />
                                    </ActionIcon>
                                </Tooltip>
                            )}
                        </CopyButton>
                    ) : null}
                </Group>
            }
            rightHeaderElement={
                sqlIsOpen && queryView === 'sql' ? (
                    <Can
                        I="manage"
                        this={subject('SqlRunner', {
                            organizationUuid: user.data?.organizationUuid,
                            projectUuid,
                        })}
                    >
                        <OpenInSqlRunnerButton projectUuid={projectUuid} />
                    </Can>
                ) : undefined
            }
        >
            <Suspense fallback={<Skeleton height={60} radius="sm" />}>
                {queryView === 'sql' ? (
                    <LazyRenderedSql />
                ) : (
                    <LazyRenderedMetricQuery />
                )}
            </Suspense>
        </CollapsableCard>
    );
});

export default SqlCard;
