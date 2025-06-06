import { DbtProjectType } from '@lightdash/common';
import {
    ActionIcon,
    Button,
    Group,
    Menu,
    Paper,
    Stack,
    Text,
    Tooltip,
} from '@mantine/core';
import { useClipboard } from '@mantine/hooks';
import {
    IconBrandGithub,
    IconChevronDown,
    IconDeviceFloppy,
    IconLink,
    IconTableAlias,
} from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';

import { useCallback, useMemo, useState, type FC } from 'react';
import { cartesianChartSelectors } from '../../../../components/DataViz/store/selectors';
import { EditableText } from '../../../../components/VisualizationConfigs/common/EditableText';
import MantineIcon from '../../../../components/common/MantineIcon';
import { useGitIntegration } from '../../../../hooks/gitIntegration/useGitIntegration';
import useHealth from '../../../../hooks/health/useHealth';
import useToaster from '../../../../hooks/toaster/useToaster';
import { useProject } from '../../../../hooks/useProject';
import { CreateVirtualViewModal } from '../../../virtualView';
import { useCreateSqlRunnerShareUrl } from '../../hooks/useSqlRunnerShareUrl';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import {
    EditorTabs,
    setActiveEditorTab,
    toggleModal,
    updateName,
} from '../../store/sqlRunnerSlice';
import { ChartErrorsAlert } from '../ChartErrorsAlert';
import { SaveSqlChartModal } from '../SaveSqlChartModal';
import { WriteBackToDbtModal } from '../WriteBackToDbtModal';

type CtaAction = 'save' | 'createVirtualView' | 'writeBackToDbt';

const DEFAULT_SQL_NAME = 'Untitled SQL query';
const DEFAULT_NAME_VIRTUAL_VIEW = 'Untitled virtual view';

export const HeaderCreate: FC = () => {
    const { t } = useTranslation();
    const projectUuid = useAppSelector((state) => state.sqlRunner.projectUuid);
    const { data: project } = useProject(projectUuid);

    const dispatch = useAppDispatch();
    const name = useAppSelector((state) => state.sqlRunner.name);
    const loadedColumns = useAppSelector((state) => state.sqlRunner.sqlColumns);
    const isSaveModalOpen = useAppSelector(
        (state) => state.sqlRunner.modals.saveChartModal.isOpen,
    );
    const health = useHealth();
    const { data: gitIntegration } = useGitIntegration();

    const [writeBackDisabledMessage, writeBackOpenUrl] = useMemo(() => {
        const hasGithubEnabled = gitIntegration?.enabled;
        const hasGithubProject =
            project?.dbtConnection.type === DbtProjectType.GITHUB;
        const hasGithubIntegration = health?.data?.hasGithub;

        if (!hasGithubIntegration) {
            return [
                t(
                    'features_sql_runner_header_create.github_integration_not_enabled',
                ),
                'https://docs.lightdash.com/self-host/customize-deployment/environment-variables#github-integration',
            ];
        }
        if (!hasGithubEnabled) {
            return [
                t(
                    'features_sql_runner_header_create.github_integration_not_active',
                ),
                `${health?.data?.siteUrl}/generalSettings/integrations`,
            ];
        }
        if (!hasGithubProject) {
            return [
                <Text key="writeBackDisabledMessage">
                    {t(
                        'features_sql_runner_header_create.write_back_disabled_message.part_1',
                    )}{' '}
                    <Text span fw={600}>
                        {project?.name}
                    </Text>{' '}
                    {t(
                        'features_sql_runner_header_create.write_back_disabled_message.part_2',
                    )}
                </Text>,
                `${health?.data?.siteUrl}/generalSettings/projectManagement/${projectUuid}/settings`,
            ];
        }
        return [undefined, undefined];
    }, [
        gitIntegration?.enabled,
        health?.data?.hasGithub,
        health?.data?.siteUrl,
        project?.dbtConnection.type,
        project?.name,
        projectUuid,
        t,
    ]);

    const isCreateVirtualViewModalOpen = useAppSelector(
        (state) => state.sqlRunner.modals.createVirtualViewModal.isOpen,
    );
    const isWriteBackToDbtModalOpen = useAppSelector(
        (state) => state.sqlRunner.modals.writeBackToDbtModal.isOpen,
    );
    const isChartErrorsAlertOpen = useAppSelector(
        (state) => state.sqlRunner.modals.chartErrorsAlert.isOpen,
    );
    const onCloseSaveModal = useCallback(() => {
        dispatch(toggleModal('saveChartModal'));
    }, [dispatch]);
    const onCloseCreateVirtualViewModal = useCallback(() => {
        dispatch(toggleModal('createVirtualViewModal'));
    }, [dispatch]);
    const onCloseWriteBackToDbtModal = useCallback(() => {
        dispatch(toggleModal('writeBackToDbtModal'));
    }, [dispatch]);

    const selectedChartType = useAppSelector(
        (state) => state.sqlRunner.selectedChartType,
    );
    const hasErrors = useAppSelector(
        (state) =>
            !!cartesianChartSelectors.getErrors(state, selectedChartType),
    );

    const [ctaAction, setCtaAction] = useState<CtaAction>('save');

    const handleCtaClick = useCallback(() => {
        switch (ctaAction) {
            case 'save':
                if (hasErrors) {
                    dispatch(toggleModal('chartErrorsAlert'));
                } else {
                    dispatch(toggleModal('saveChartModal'));
                }
                break;
            case 'createVirtualView':
                dispatch(toggleModal('createVirtualViewModal'));
                break;
            case 'writeBackToDbt':
                dispatch(toggleModal('writeBackToDbtModal'));
                break;
        }
    }, [ctaAction, dispatch, hasErrors]);

    const getCtaLabels = useCallback(
        (action: CtaAction) => {
            switch (action) {
                case 'save':
                    return {
                        label: t(
                            'features_sql_runner_header_create.save.label',
                        ),
                        description: t(
                            'features_sql_runner_header_create.save.description',
                        ),
                    };
                case 'createVirtualView':
                    return {
                        label: t(
                            'features_sql_runner_header_create.virtual_view.label',
                        ),
                        description: t(
                            'features_sql_runner_header_create.virtual_view.description',
                        ),
                    };
                case 'writeBackToDbt':
                    return {
                        label: t(
                            'features_sql_runner_header_create.back_to_dbt.label',
                        ),
                        description: t(
                            'features_sql_runner_header_create.back_to_dbt.description',
                        ),
                    };
            }
        },
        [t],
    );

    const getCtaIcon = useCallback((action: CtaAction) => {
        switch (action) {
            case 'save':
                return <MantineIcon icon={IconDeviceFloppy} />;
            case 'createVirtualView':
                return <MantineIcon icon={IconTableAlias} />;
            case 'writeBackToDbt':
                return <MantineIcon icon={IconBrandGithub} />;
        }
    }, []);

    const untitledName = useMemo(() => {
        if (ctaAction === 'createVirtualView') {
            return DEFAULT_NAME_VIRTUAL_VIEW;
        }
        return DEFAULT_SQL_NAME;
    }, [ctaAction]);

    const clipboard = useClipboard({ timeout: 500 });
    const { showToastSuccess } = useToaster();
    const createShareUrl = useCreateSqlRunnerShareUrl();

    const handleCreateShareUrl = useCallback(async () => {
        const fullUrl = await createShareUrl();
        clipboard.copy(fullUrl);
        showToastSuccess({
            title: t('features_sql_runner_header_create.tips.shared'),
        });
    }, [createShareUrl, clipboard, showToastSuccess, t]);

    return (
        <>
            <Paper
                shadow="none"
                radius={0}
                px="md"
                py="xs"
                sx={(theme) => ({
                    borderBottom: `1px solid ${theme.colors.gray[3]}`,
                })}
            >
                <Group position="apart">
                    <Group spacing="two">
                        <EditableText
                            size="md"
                            w={400}
                            placeholder={untitledName}
                            value={name}
                            onChange={(e) =>
                                dispatch(updateName(e.currentTarget.value))
                            }
                        />
                    </Group>

                    <Group spacing="xs">
                        <Button.Group>
                            <Button
                                variant="default"
                                size="xs"
                                leftIcon={getCtaIcon(ctaAction)}
                                disabled={!loadedColumns}
                                onClick={handleCtaClick}
                            >
                                {getCtaLabels(ctaAction).label}
                            </Button>
                            <Menu
                                withinPortal
                                disabled={!loadedColumns}
                                position="bottom-end"
                                withArrow
                                shadow="md"
                                offset={2}
                                arrowOffset={10}
                            >
                                <Menu.Target>
                                    <Button
                                        size="xs"
                                        p={4}
                                        disabled={!loadedColumns}
                                        variant="default"
                                    >
                                        <MantineIcon
                                            icon={IconChevronDown}
                                            size="sm"
                                        />
                                    </Button>
                                </Menu.Target>

                                <Menu.Dropdown>
                                    <Menu.Item
                                        onClick={() => {
                                            setCtaAction('save');
                                        }}
                                    >
                                        <Stack spacing="two">
                                            <Text
                                                fz="xs"
                                                fw={600}
                                                c={
                                                    ctaAction === 'save'
                                                        ? 'blue'
                                                        : undefined
                                                }
                                            >
                                                {getCtaLabels('save').label}
                                            </Text>
                                            <Text fz={10} c="gray.6">
                                                {
                                                    getCtaLabels('save')
                                                        .description
                                                }
                                            </Text>
                                        </Stack>
                                    </Menu.Item>

                                    <Menu.Item
                                        onClick={() => {
                                            setCtaAction('createVirtualView');
                                        }}
                                    >
                                        <Stack spacing="two">
                                            <Text
                                                fw={600}
                                                fz="xs"
                                                c={
                                                    ctaAction ===
                                                    'createVirtualView'
                                                        ? 'blue'
                                                        : undefined
                                                }
                                            >
                                                {
                                                    getCtaLabels(
                                                        'createVirtualView',
                                                    ).label
                                                }
                                            </Text>
                                            <Text fz={10} c="gray.6">
                                                {
                                                    getCtaLabels(
                                                        'createVirtualView',
                                                    ).description
                                                }
                                            </Text>
                                        </Stack>
                                    </Menu.Item>

                                    <Tooltip
                                        label={writeBackDisabledMessage}
                                        multiline
                                        maw={400}
                                        position="top"
                                        withArrow
                                        withinPortal
                                        disabled={
                                            writeBackDisabledMessage ===
                                            undefined
                                        }
                                        onClick={() => {
                                            if (writeBackOpenUrl)
                                                window.open(
                                                    writeBackOpenUrl,
                                                    '_blank',
                                                );
                                        }}
                                    >
                                        <Group
                                            sx={{
                                                cursor: 'pointer',
                                            }}
                                        >
                                            <Menu.Item
                                                disabled={
                                                    writeBackDisabledMessage !==
                                                    undefined
                                                }
                                                onClick={() => {
                                                    setCtaAction(
                                                        'writeBackToDbt',
                                                    );
                                                }}
                                            >
                                                <Stack spacing="two">
                                                    <Text
                                                        fw={600}
                                                        fz="xs"
                                                        c={
                                                            ctaAction ===
                                                            'writeBackToDbt'
                                                                ? 'blue'
                                                                : undefined
                                                        }
                                                    >
                                                        {
                                                            getCtaLabels(
                                                                'writeBackToDbt',
                                                            ).label
                                                        }
                                                    </Text>
                                                    <Text fz={10} c="gray.6">
                                                        {
                                                            getCtaLabels(
                                                                'writeBackToDbt',
                                                            ).description
                                                        }
                                                    </Text>
                                                </Stack>
                                            </Menu.Item>
                                        </Group>
                                    </Tooltip>
                                </Menu.Dropdown>
                            </Menu>
                        </Button.Group>
                        <ActionIcon
                            variant="default"
                            onClick={handleCreateShareUrl}
                        >
                            <MantineIcon icon={IconLink} />
                        </ActionIcon>
                    </Group>
                </Group>
            </Paper>
            <SaveSqlChartModal
                key={`${isSaveModalOpen}-saveChartModal`}
                opened={isSaveModalOpen}
                onClose={onCloseSaveModal}
            />
            <CreateVirtualViewModal
                key={`${isCreateVirtualViewModalOpen}-createVirtualViewModal`}
                opened={isCreateVirtualViewModalOpen}
                onClose={onCloseCreateVirtualViewModal}
            />

            <WriteBackToDbtModal
                key={`${isWriteBackToDbtModalOpen}-writeBackToDbtModal`}
                opened={isWriteBackToDbtModalOpen}
                onClose={onCloseWriteBackToDbtModal}
            />
            <ChartErrorsAlert
                opened={isChartErrorsAlertOpen}
                onClose={() => {
                    dispatch(toggleModal('chartErrorsAlert'));
                }}
                onFixButtonClick={() => {
                    dispatch(toggleModal('chartErrorsAlert'));
                    dispatch(setActiveEditorTab(EditorTabs.VISUALIZATION));
                }}
            />
        </>
    );
};
