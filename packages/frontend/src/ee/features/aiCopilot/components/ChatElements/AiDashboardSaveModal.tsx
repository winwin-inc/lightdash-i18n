import { subject } from '@casl/ability';
import {
    type AiArtifact,
    type ApiAiAgentThreadMessageVizQuery,
    type Dashboard,
    type ToolDashboardArgs,
} from '@lightdash/common';
import {
    Button,
    Group,
    LoadingOverlay,
    Stack,
    TextInput,
    Textarea,
} from '@mantine-8/core';
import { useForm } from '@mantine/form';
import { IconPlus } from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';

import MantineIcon from '../../../../../components/common/MantineIcon';
import MantineModal, {
    type MantineModalProps,
} from '../../../../../components/common/MantineModal';
import SaveToSpaceForm from '../../../../../components/common/modal/ChartCreateModal/SaveToSpaceForm';
import { useCreateDashboardWithChartsMutation } from '../../../../../hooks/dashboard/useDashboard';
import useToaster from '../../../../../hooks/toaster/useToaster';
import { useSpaceManagement } from '../../../../../hooks/useSpaceManagement';
import { useSpaceSummaries } from '../../../../../hooks/useSpaces';
import useApp from '../../../../../providers/App/useApp';
import {
    getAiAgentDashboardChartVizQueryKey,
    useUpdateArtifactVersion,
} from '../../hooks/useProjectAiAgents';
import { convertDashboardVisualizationsToChartData } from '../../utils/dashboardChartConverter';

enum ModalStep {
    InitialInfo = 'initialInfo',
    SelectDestination = 'selectDestination',
    Saving = 'saving',
}

interface FormValues {
    dashboardName: string;
    dashboardDescription: string;
    spaceUuid: string | null;
    newSpaceName: string | null;
}

interface Props extends Omit<MantineModalProps, 'children' | 'title'> {
    artifactData: AiArtifact;
    projectUuid: string;
    agentUuid: string;
    dashboardConfig: ToolDashboardArgs;
    onSuccess?: (dashboard: Dashboard) => void;
}

export const AiDashboardSaveModal: FC<Props> = ({
    artifactData,
    projectUuid,
    agentUuid,
    dashboardConfig,
    onSuccess,
    onClose,
    ...modalProps
}) => {
    const { t } = useTranslation();

    const { user } = useApp();
    const navigate = useNavigate();
    const { showToastSuccess, showToastApiError } = useToaster();
    const queryClient = useQueryClient();

    const [currentStep, setCurrentStep] = useState<ModalStep>(
        ModalStep.InitialInfo,
    );
    const { mutateAsync: createDashboardWithCharts } =
        useCreateDashboardWithChartsMutation(projectUuid, {
            showToastOnSuccess: false, // We'll handle success toast manually
        });

    const { mutateAsync: updateArtifactVersion } = useUpdateArtifactVersion(
        projectUuid,
        agentUuid,
        artifactData.artifactUuid,
        artifactData.versionUuid,
    );

    const form = useForm<FormValues>({
        initialValues: {
            dashboardName: dashboardConfig.title,
            dashboardDescription: dashboardConfig.description,
            spaceUuid: null,
            newSpaceName: null,
        },
        validate: {
            dashboardName: (value: string) =>
                value.length === 0
                    ? t('ai_dashboard_save_modal.dashboard_name_validation')
                    : null,
        },
    });

    const spaceManagement = useSpaceManagement({
        projectUuid,
    });

    const { isCreatingNewSpace, openCreateSpaceForm, setSelectedSpaceUuid } =
        spaceManagement;

    const {
        data: spaces,
        isInitialLoading: isLoadingSpaces,
        isSuccess: isSpacesSuccess,
    } = useSpaceSummaries(projectUuid, true, {
        staleTime: 0,
        select: (data) =>
            data.filter((space) =>
                user.data?.ability.can(
                    'create',
                    subject('Dashboard', {
                        ...space,
                        access: space.userAccess ? [space.userAccess] : [],
                    }),
                ),
            ),
    });

    // Read cached viz-query results from react-query client using exported key
    const getCachedVizQueries = useCallback(() => {
        const results: (ApiAiAgentThreadMessageVizQuery | undefined)[] = [];
        for (let i = 0; i < dashboardConfig.visualizations.length; i++) {
            const key = getAiAgentDashboardChartVizQueryKey({
                projectUuid,
                agentUuid,
                artifactUuid: artifactData.artifactUuid,
                versionUuid: artifactData.versionUuid,
                chartIndex: i,
            });
            const data =
                queryClient.getQueryData<ApiAiAgentThreadMessageVizQuery>(key);
            results.push(data);
        }
        return results;
    }, [
        dashboardConfig.visualizations.length,
        projectUuid,
        agentUuid,
        artifactData.artifactUuid,
        artifactData.versionUuid,
        queryClient,
    ]);

    const { setFieldValue } = form;

    useEffect(() => {
        if (!isSpacesSuccess || !modalProps.opened) {
            return;
        }

        // Set default space
        const defaultSpace = spaces?.find((space) => !space.parentSpaceUuid);
        if (defaultSpace) {
            setFieldValue('spaceUuid', defaultSpace.uuid);
            setSelectedSpaceUuid(defaultSpace.uuid);
        }
    }, [
        isSpacesSuccess,
        modalProps.opened,
        setFieldValue,
        spaces,
        setSelectedSpaceUuid,
    ]);

    const handleClose = useCallback(() => {
        form.reset();
        setCurrentStep(ModalStep.InitialInfo);
        onClose?.();
    }, [form, onClose]);

    const handleNextStep = () => {
        if (form.validate().hasErrors) return;
        setCurrentStep(ModalStep.SelectDestination);
    };

    const handleBack = () => {
        setCurrentStep(ModalStep.InitialInfo);
    };

    const handleSaveDashboard = useCallback(
        async (values: FormValues) => {
            try {
                setCurrentStep(ModalStep.Saving);

                // Handle new space creation
                let targetSpaceUuid = values.spaceUuid;
                if (values.newSpaceName) {
                    const newSpace = await spaceManagement.handleCreateNewSpace(
                        {
                            isPrivate: false,
                        },
                    );
                    targetSpaceUuid = newSpace?.uuid || values.spaceUuid;
                }

                // Get all visualization query results from cache
                const cachedVizQueries = getCachedVizQueries();
                if (cachedVizQueries.some((q) => !q)) {
                    showToastApiError({
                        title: t(
                            'ai_dashboard_save_modal.failed_to_save_dashboard',
                        ),
                        apiError: {
                            name: 'ValidationError',
                            message: t(
                                'ai_dashboard_save_modal.failed_to_save_dashboard_description',
                            ),
                            statusCode: 400,
                            data: {},
                        },
                    });
                    setCurrentStep(ModalStep.SelectDestination);
                    return;
                }

                const vizQueryResults = cachedVizQueries.filter(
                    (c) => c !== undefined,
                );

                // Convert visualizations to chart data
                const chartDataArray =
                    convertDashboardVisualizationsToChartData(
                        dashboardConfig,
                        vizQueryResults,
                        {
                            userId: user.data?.userUuid,
                        },
                    );

                // Map to CreateSavedChart format for the API
                const charts = chartDataArray.map((chartData, index) => ({
                    ...chartData,
                    name: dashboardConfig.visualizations[index].title,
                }));

                // Create dashboard with charts in one API call
                const dashboard = await createDashboardWithCharts({
                    name: values.dashboardName,
                    description: values.dashboardDescription,
                    spaceUuid: targetSpaceUuid!,
                    charts,
                });

                // Update AI artifact with saved dashboard UUID
                await updateArtifactVersion({
                    savedDashboardUuid: dashboard.uuid,
                });

                showToastSuccess({
                    title: t(
                        'ai_dashboard_save_modal.success_to_save_dashboard',
                    ),
                    action: {
                        children: t('ai_dashboard_save_modal.open_dashboard'),
                        onClick: () =>
                            navigate(
                                `/projects/${projectUuid}/dashboards/${dashboard.uuid}`,
                            ),
                    },
                });

                onSuccess?.(dashboard);
                handleClose();
            } catch (error) {
                console.error(error);
                showToastApiError({
                    title: t(
                        'ai_dashboard_save_modal.failed_to_create_dashboard',
                    ),
                    apiError: error as any,
                });
                setCurrentStep(ModalStep.SelectDestination);
            }
        },
        [
            createDashboardWithCharts,
            dashboardConfig,
            user.data?.userUuid,
            spaceManagement,
            navigate,
            projectUuid,
            onSuccess,
            showToastSuccess,
            showToastApiError,
            handleClose,
            getCachedVizQueries,
            updateArtifactVersion,
            t,
        ],
    );

    const shouldShowNewSpaceButton = useMemo(
        () =>
            currentStep === ModalStep.SelectDestination && !isCreatingNewSpace,
        [currentStep, isCreatingNewSpace],
    );

    const isFormReadyToSave = useMemo(
        () =>
            currentStep === ModalStep.SelectDestination &&
            form.values.dashboardName &&
            (form.values.newSpaceName || form.values.spaceUuid),
        [
            currentStep,
            form.values.dashboardName,
            form.values.newSpaceName,
            form.values.spaceUuid,
        ],
    );

    const isLoading =
        isLoadingSpaces || spaceManagement.createSpaceMutation.isLoading;

    if (isLoadingSpaces || !spaces) return null;

    const modalActions = (
        <>
            <div>
                {shouldShowNewSpaceButton && (
                    <Button
                        variant="subtle"
                        size="xs"
                        leftSection={<MantineIcon icon={IconPlus} />}
                        onClick={openCreateSpaceForm}
                    >
                        {t('ai_dashboard_save_modal.new_space')}
                    </Button>
                )}
            </div>

            <Group>
                {currentStep === ModalStep.SelectDestination && (
                    <Button onClick={handleBack} variant="outline">
                        {t('ai_dashboard_save_modal.back')}
                    </Button>
                )}
                <Button onClick={handleClose} variant="outline">
                    {t('ai_dashboard_save_modal.cancel')}
                </Button>
                <Button
                    type="submit"
                    disabled={
                        currentStep === ModalStep.SelectDestination
                            ? !isFormReadyToSave
                            : !form.values.dashboardName
                    }
                    form="dashboard-save-form"
                >
                    {currentStep === ModalStep.InitialInfo
                        ? t('ai_dashboard_save_modal.next')
                        : t('ai_dashboard_save_modal.save')}
                </Button>
            </Group>
        </>
    );

    return (
        <MantineModal
            {...modalProps}
            title={t('ai_dashboard_save_modal.save_dashboard')}
            onClose={handleClose}
            size="lg"
            actions={modalActions}
            modalActionsProps={{ justify: 'space-between' }}
        >
            <LoadingOverlay
                visible={isLoading || currentStep === ModalStep.Saving}
            />

            <form
                id="dashboard-save-form"
                onSubmit={form.onSubmit((values: FormValues) => {
                    if (currentStep === ModalStep.InitialInfo) {
                        handleNextStep();
                    } else if (currentStep === ModalStep.SelectDestination) {
                        void handleSaveDashboard(values);
                    }
                })}
            >
                {currentStep === ModalStep.InitialInfo && (
                    <Stack gap="md">
                        <TextInput
                            label={t('ai_dashboard_save_modal.form.name.label')}
                            placeholder={t(
                                'ai_dashboard_save_modal.form.name.placeholder',
                            )}
                            required
                            {...form.getInputProps('dashboardName')}
                        />
                        <Textarea
                            label={t(
                                'ai_dashboard_save_modal.form.description.label',
                            )}
                            placeholder={t(
                                'ai_dashboard_save_modal.form.description.placeholder',
                            )}
                            autosize
                            maxRows={3}
                            {...form.getInputProps('dashboardDescription')}
                        />
                    </Stack>
                )}

                {currentStep === ModalStep.SelectDestination && (
                    <SaveToSpaceForm
                        form={form}
                        spaces={spaces}
                        projectUuid={projectUuid}
                        isLoading={isLoading}
                        spaceManagement={spaceManagement}
                        selectedSpaceName={
                            spaces.find(
                                (space) => space.uuid === form.values.spaceUuid,
                            )?.name
                        }
                    />
                )}
            </form>
        </MantineModal>
    );
};
