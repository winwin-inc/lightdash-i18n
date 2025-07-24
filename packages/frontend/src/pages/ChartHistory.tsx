import { subject } from '@casl/ability';
import { formatTimestamp, TimeFrames } from '@lightdash/common';
import {
    ActionIcon,
    Alert,
    Badge,
    Button,
    Flex,
    Group,
    Menu,
    Modal,
    NavLink,
    Stack,
    Text,
    Title,
    Tooltip,
} from '@mantine/core';
import {
    IconDots,
    IconFileAnalytics,
    IconHistory,
    IconInfoCircle,
} from '@tabler/icons-react';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';
import { EmptyState } from '../components/common/EmptyState';
import ErrorState from '../components/common/ErrorState';
import MantineIcon from '../components/common/MantineIcon';
import Page from '../components/common/Page/Page';
import PageBreadcrumbs from '../components/common/PageBreadcrumbs';
import SuboptimalState from '../components/common/SuboptimalState/SuboptimalState';
import Explorer from '../components/Explorer';
import {
    useChartHistory,
    useChartVersion,
    useChartVersionRollbackMutation,
    useSavedQuery,
} from '../hooks/useSavedQuery';
import { Can } from '../providers/Ability';
import ExplorerProvider from '../providers/Explorer/ExplorerProvider';
import { ExplorerSection } from '../providers/Explorer/types';
import NoTableIcon from '../svgs/emptystate-no-table.svg?react';

const ChartHistory = () => {
    const { t } = useTranslation();

    const navigate = useNavigate();
    const { savedQueryUuid, projectUuid } = useParams<{
        savedQueryUuid: string;
        projectUuid: string;
    }>();
    const [selectedVersionUuid, selectVersionUuid] = useState<string>();
    const [isRollbackModalOpen, setIsRollbackModalOpen] = useState(false);
    const chartQuery = useSavedQuery({
        id: savedQueryUuid,
    });
    const historyQuery = useChartHistory(savedQueryUuid);

    useEffect(() => {
        const currentVersion = historyQuery.data?.history[0];
        if (currentVersion && !selectedVersionUuid) {
            selectVersionUuid(currentVersion.versionUuid);
        }
    }, [selectedVersionUuid, historyQuery.data]);

    const chartVersionQuery = useChartVersion(
        savedQueryUuid,
        selectedVersionUuid,
    );

    const rollbackMutation = useChartVersionRollbackMutation(savedQueryUuid, {
        onSuccess: () => {
            void navigate(
                `/projects/${projectUuid}/saved/${savedQueryUuid}/view`,
            );
        },
    });

    if (historyQuery.isInitialLoading || chartQuery.isInitialLoading) {
        return (
            <div style={{ marginTop: '20px' }}>
                <SuboptimalState title="Loading..." loading />
            </div>
        );
    }
    if (historyQuery.error || chartQuery.error) {
        return (
            <ErrorState
                error={historyQuery.error?.error || chartQuery.error?.error}
            />
        );
    }

    return (
        <Page
            title={t('pages_chart_history.title')}
            withSidebarFooter
            withFullHeight
            withPaddedContent
            sidebar={
                <Stack
                    spacing="xl"
                    mah="100%"
                    sx={{ overflowY: 'hidden', flex: 1 }}
                >
                    <Flex gap="xs">
                        <PageBreadcrumbs
                            items={[
                                {
                                    title: t(
                                        'pages_chart_history.bread_crumbs.chart',
                                    ),
                                    to: `/projects/${projectUuid}/saved/${savedQueryUuid}/view`,
                                },
                                {
                                    title: t(
                                        'pages_chart_history.bread_crumbs.version_history',
                                    ),
                                    active: true,
                                },
                            ]}
                        />
                    </Flex>
                    <Stack spacing="xs" sx={{ flexGrow: 1, overflowY: 'auto' }}>
                        {historyQuery.data?.history.map((version, index) => (
                            <NavLink
                                key={version.versionUuid}
                                active={
                                    version.versionUuid === selectedVersionUuid
                                }
                                icon={<MantineIcon icon={IconFileAnalytics} />}
                                label={formatTimestamp(
                                    version.createdAt,
                                    TimeFrames.SECOND,
                                )}
                                description={
                                    <Text>
                                        {t('pages_chart_history.updated_by')}{' '}
                                        {version.createdBy?.firstName}{' '}
                                        {version.createdBy?.lastName}
                                    </Text>
                                }
                                rightSection={
                                    <>
                                        {index === 0 && (
                                            <Tooltip
                                                label={t(
                                                    'pages_chart_history.tooltip_current.label',
                                                )}
                                            >
                                                <Badge
                                                    size="xs"
                                                    variant="light"
                                                    color="green"
                                                >
                                                    {t(
                                                        'pages_chart_history.tooltip_current.current',
                                                    )}
                                                </Badge>
                                            </Tooltip>
                                        )}
                                        {index !== 0 &&
                                            version.versionUuid ===
                                                selectedVersionUuid && (
                                                <Can
                                                    I="manage"
                                                    this={subject(
                                                        'SavedChart',
                                                        {
                                                            ...chartQuery.data,
                                                        },
                                                    )}
                                                >
                                                    <Menu
                                                        withinPortal
                                                        position="bottom-start"
                                                        withArrow
                                                        arrowPosition="center"
                                                        shadow="md"
                                                        offset={-4}
                                                        closeOnItemClick
                                                        closeOnClickOutside
                                                    >
                                                        <Menu.Target>
                                                            <ActionIcon
                                                                sx={(
                                                                    theme,
                                                                ) => ({
                                                                    ':hover': {
                                                                        backgroundColor:
                                                                            theme
                                                                                .colors
                                                                                .gray[1],
                                                                    },
                                                                })}
                                                            >
                                                                <IconDots
                                                                    size={16}
                                                                />
                                                            </ActionIcon>
                                                        </Menu.Target>

                                                        <Menu.Dropdown
                                                            maw={320}
                                                        >
                                                            <Menu.Item
                                                                component="button"
                                                                role="menuitem"
                                                                icon={
                                                                    <IconHistory
                                                                        size={
                                                                            18
                                                                        }
                                                                    />
                                                                }
                                                                onClick={() => {
                                                                    setIsRollbackModalOpen(
                                                                        true,
                                                                    );
                                                                }}
                                                            >
                                                                {t(
                                                                    'pages_chart_history.menus.restore_this_version',
                                                                )}
                                                            </Menu.Item>
                                                        </Menu.Dropdown>
                                                    </Menu>
                                                </Can>
                                            )}
                                    </>
                                }
                                onClick={() =>
                                    selectVersionUuid(version.versionUuid)
                                }
                            />
                        ))}
                    </Stack>
                    <Alert
                        icon={<MantineIcon icon={IconInfoCircle} size={'md'} />}
                        title={t('pages_chart_history.alert.title')}
                        color="gray"
                        variant="light"
                    >
                        <p>{t('pages_chart_history.alert.content')}</p>
                    </Alert>
                </Stack>
            }
        >
            {!selectedVersionUuid && (
                <EmptyState
                    maw={500}
                    icon={<NoTableIcon />}
                    title={t('pages_chart_history.empty.title')}
                />
            )}
            {chartVersionQuery.data && (
                <ExplorerProvider
                    key={selectedVersionUuid}
                    viewModeQueryArgs={
                        savedQueryUuid && selectedVersionUuid
                            ? {
                                  chartUuid: savedQueryUuid,
                                  chartVersionUuid: selectedVersionUuid,
                              }
                            : undefined
                    }
                    initialState={{
                        shouldFetchResults: true,
                        previouslyFetchedState: undefined,
                        expandedSections: [ExplorerSection.VISUALIZATION],
                        unsavedChartVersion: chartVersionQuery.data.chart,
                        modals: {
                            format: {
                                isOpen: false,
                            },
                            additionalMetric: {
                                isOpen: false,
                            },
                            customDimension: {
                                isOpen: false,
                            },
                            writeBack: {
                                isOpen: false,
                            },
                        },
                        parameters: {},
                    }}
                    savedChart={chartVersionQuery.data?.chart}
                >
                    <Explorer hideHeader={true} />
                </ExplorerProvider>
            )}

            <Modal
                opened={isRollbackModalOpen}
                onClose={() => setIsRollbackModalOpen(false)}
                withCloseButton={false}
                title={
                    <Group spacing="xs">
                        <MantineIcon icon={IconHistory} size="lg" />
                        <Title order={4}>
                            {t('pages_chart_history.modal.title')}
                        </Title>
                    </Group>
                }
            >
                <Stack>
                    <Text>{t('pages_chart_history.modal.content')}</Text>
                    <Group position="right" spacing="xs">
                        <Button
                            variant="outline"
                            disabled={rollbackMutation.isLoading}
                            onClick={() => setIsRollbackModalOpen(false)}
                        >
                            {t('pages_chart_history.modal.cancel')}
                        </Button>
                        <Button
                            loading={rollbackMutation.isLoading}
                            onClick={() =>
                                selectedVersionUuid &&
                                rollbackMutation.mutate(selectedVersionUuid)
                            }
                            type="submit"
                        >
                            {t('pages_chart_history.modal.restore')}
                        </Button>
                    </Group>
                </Stack>
            </Modal>
        </Page>
    );
};

export default ChartHistory;
