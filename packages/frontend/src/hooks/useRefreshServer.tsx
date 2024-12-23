import {
    JobStatusType,
    JobStepStatusType,
    JobType,
    type ApiError,
    type ApiRefreshResults,
    type Job,
    type JobStep,
} from '@lightdash/common';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';

import { lightdashApi } from '../api';
import { useActiveJob } from '../providers/ActiveJobProvider';
import useToaster from './toaster/useToaster';

export const useJobStepStatusLabel = () => {
    const { t } = useTranslation();

    return (status: JobStepStatusType) => {
        switch (status) {
            case JobStepStatusType.DONE:
                return t('hooks_refresh_server.job_steps_status.done');
            case JobStepStatusType.PENDING:
                return t('hooks_refresh_server.job_steps_status.pending');
            case JobStepStatusType.SKIPPED:
                return t('hooks_refresh_server.job_steps_status.skipped');
            case JobStepStatusType.ERROR:
                return t('hooks_refresh_server.job_steps_status.error');
            case JobStepStatusType.RUNNING:
                return t('hooks_refresh_server.job_steps_status.running');
            default:
                throw new Error(
                    t('hooks_refresh_server.job_steps_status.unknown'),
                );
        }
    };
};

export const useJobStatusLabel = () => {
    const { t } = useTranslation();

    return (status: JobStatusType) => {
        switch (status) {
            case JobStatusType.DONE:
                return t('hooks_refresh_server.job_status.done');
            case JobStatusType.STARTED:
                return t('hooks_refresh_server.job_status.started');
            case JobStatusType.ERROR:
                return t('hooks_refresh_server.job_status.error');
            case JobStatusType.RUNNING:
                return t('hooks_refresh_server.job_status.running');
            default:
                throw new Error(t('hooks_refresh_server.job_status.unknown'));
        }
    };
};

export const runningStepsInfo = (steps: JobStep[]) => {
    const runningStep = steps.find((step) => {
        return step.stepStatus === 'RUNNING';
    });
    const numberOfCompletedSteps = steps.filter((step) => {
        return step.stepStatus === 'DONE';
    }).length;
    const completedStepsMessage = `${numberOfCompletedSteps}/${steps.length}`;
    const runningStepMessage = `Step ${Math.min(
        numberOfCompletedSteps + 1,
        steps.length,
    )}/${steps.length}: ${runningStep?.stepLabel || ''}`;

    return {
        runningStep,
        numberOfCompletedSteps,
        completedStepsMessage,
        runningStepMessage,
        totalSteps: steps.length,
    };
};

export const TOAST_KEY_FOR_REFRESH_JOB = 'refresh-job';

const refresh = async (projectUuid: string) =>
    lightdashApi<ApiRefreshResults>({
        method: 'POST',
        url: `/projects/${projectUuid}/refresh`,
        body: undefined,
    });

const getJob = async (jobUuid: string) =>
    lightdashApi<Job>({
        method: 'GET',
        url: `/jobs/${jobUuid}`,
        body: undefined,
    });

export const useJob = (
    jobId: string | undefined,
    onSuccess: (job: Job) => void,
    onError: (error: ApiError) => void,
) => {
    const queryClient = useQueryClient();

    return useQuery<Job, ApiError>({
        queryKey: ['job', jobId],
        queryFn: () => getJob(jobId || ''),
        enabled: !!jobId,
        refetchInterval: (data) =>
            data === undefined ||
            [JobStatusType.DONE, JobStatusType.ERROR].includes(data.jobStatus)
                ? false
                : 500,
        staleTime: 0,
        onSuccess: async (job) => {
            if (job.jobStatus === JobStatusType.DONE) {
                await queryClient.invalidateQueries(['tables']);
                await queryClient.resetQueries(['metrics-catalog'], {
                    exact: false,
                });

                if (job.jobType === JobType.COMPILE_PROJECT) {
                    await queryClient.invalidateQueries([
                        'catalog',
                        job.projectUuid,
                    ]);
                }
            }
            onSuccess(job);
        },
        onError,
    });
};

export const useRefreshServer = () => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const queryClient = useQueryClient();
    const { setActiveJobId } = useActiveJob();
    const { showToastApiError } = useToaster();
    const { t } = useTranslation();

    return useMutation<ApiRefreshResults, ApiError>({
        mutationKey: ['refresh', projectUuid],
        mutationFn: () => refresh(projectUuid),
        onSettled: async () =>
            queryClient.setQueryData(['status', projectUuid], 'loading'),
        onSuccess: (data) => setActiveJobId(data.jobUuid),
        onError: ({ error }) =>
            showToastApiError({
                title: t('hooks_refresh_server.error'),
                apiError: error,
            }),
    });
};
