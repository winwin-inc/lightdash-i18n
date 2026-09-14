import {
    EE_SCHEDULER_TASKS,
    getErrorMessage,
    isSchedulerTaskName,
    SCHEDULER_TASKS,
    SchedulerJobStatus,
} from '@lightdash/common';
import { SchedulerClient } from '../../scheduler/SchedulerClient';
import { tryJobOrTimeout } from '../../scheduler/SchedulerJobTimeout';
import { SchedulerTaskArguments } from '../../scheduler/SchedulerTask';
import { SchedulerWorker } from '../../scheduler/SchedulerWorker';
import { TypedEETaskList } from '../../scheduler/types';
import { AiAgentService } from '../services/AiAgentService';
import { AppGenerateService } from '../services/AppGenerateService/AppGenerateService';
import type { EmbedService } from '../services/EmbedService/EmbedService';

const AI_AGENT_EVAL_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes in milliseconds
const APP_GENERATE_TIMEOUT_MS = 60 * 60 * 1000; // 60 minutes

type CommercialSchedulerWorkerArguments = SchedulerTaskArguments & {
    appGenerateService: AppGenerateService;
    /** Null when running without EE license (Data Apps-only registration). */
    aiAgentService: AiAgentService | null;
    /** Null when running without EE license (Data Apps-only registration). */
    embedService: EmbedService | null;
};

export class CommercialSchedulerWorker extends SchedulerWorker {
    protected readonly appGenerateService: AppGenerateService;

    protected readonly aiAgentService: AiAgentService | null;

    protected readonly embedService: EmbedService | null;

    constructor(args: CommercialSchedulerWorkerArguments) {
        super(args);
        this.appGenerateService = args.appGenerateService;
        this.aiAgentService = args.aiAgentService;
        this.embedService = args.embedService;
    }

    protected getTaskList(): Partial<TypedEETaskList> {
        return Object.fromEntries(
            Object.entries(this.getFullTaskList()).filter(
                ([taskKey]) =>
                    isSchedulerTaskName(taskKey) &&
                    this.enabledTasks.includes(taskKey),
            ),
        );
    }

    protected getFullTaskList(): TypedEETaskList {
        return {
            ...super.getFullTaskList(),
            [EE_SCHEDULER_TASKS.SLACK_AI_PROMPT]: async (payload, _helpers) => {
                if (!this.aiAgentService) {
                    throw new Error(
                        'SLACK_AI_PROMPT requires an enterprise license',
                    );
                }
                await this.aiAgentService.replyToSlackPrompt(
                    payload.slackPromptUuid,
                );
            },
            [EE_SCHEDULER_TASKS.AI_AGENT_EVAL_RESULT]: async (
                payload,
                helpers,
            ) => {
                if (!this.aiAgentService) {
                    throw new Error(
                        'AI_AGENT_EVAL_RESULT requires an enterprise license',
                    );
                }
                const aiAgentService = this.aiAgentService;
                await tryJobOrTimeout(
                    SchedulerClient.processJob(
                        EE_SCHEDULER_TASKS.AI_AGENT_EVAL_RESULT,
                        helpers.job.id,
                        helpers.job.run_at,
                        payload,
                        async () => {
                            await aiAgentService.executeEvalResult(payload);
                        },
                    ),
                    helpers.job,
                    AI_AGENT_EVAL_TIMEOUT_MS,
                    async (job, e) => {
                        await aiAgentService.updateEvalRunResult(
                            payload.evalRunUuid,
                            payload.evalRunResultUuid,
                            new Error('Evaluation task timed out', {
                                cause: e,
                            }),
                        );
                        await this.schedulerService.logSchedulerJob({
                            task: EE_SCHEDULER_TASKS.AI_AGENT_EVAL_RESULT,
                            jobId: job.id,
                            scheduledTime: job.run_at,
                            status: SchedulerJobStatus.ERROR,
                            details: {
                                error: getErrorMessage(e),
                                projectUuid: payload.projectUuid,
                                organizationUuid: payload.organizationUuid,
                                createdByUserUuid: payload.userUuid,
                                agentUuid: payload.agentUuid,
                                evalRunUuid: payload.evalRunUuid,
                                evalRunResultUuid: payload.evalRunResultUuid,
                            },
                        });
                    },
                );
            },
            [SCHEDULER_TASKS.DOWNLOAD_ASYNC_QUERY_RESULTS]: async (
                payload,
                helpers,
            ) => {
                await tryJobOrTimeout(
                    SchedulerClient.processJob(
                        SCHEDULER_TASKS.DOWNLOAD_ASYNC_QUERY_RESULTS,
                        helpers.job.id,
                        helpers.job.run_at,
                        payload,
                        async (): Promise<void> => {
                            const { encodedJwt, ...rest } = payload;
                            if (encodedJwt) {
                                if (!this.embedService) {
                                    throw new Error(
                                        'JWT downloadAsyncQueryResults requires an enterprise license',
                                    );
                                }
                                const embedService = this.embedService;
                                await this.logWrapper(
                                    {
                                        task: SCHEDULER_TASKS.DOWNLOAD_ASYNC_QUERY_RESULTS,
                                        jobId: helpers.job.id,
                                        scheduledTime: helpers.job.run_at,
                                        details: {
                                            createdByUserUuid: payload.userUuid,
                                            projectUuid: payload.projectUuid,
                                            organizationUuid:
                                                payload.organizationUuid,
                                        },
                                    },
                                    async () => {
                                        const account =
                                            await embedService.getAccountFromJwt(
                                                rest.projectUuid,
                                                encodedJwt,
                                            );
                                        return this.asyncQueryService.download({
                                            account,
                                            ...payload,
                                        });
                                    },
                                );
                            } else {
                                await this.downloadAsyncQueryResults(
                                    helpers.job.id,
                                    helpers.job.run_at,
                                    payload,
                                );
                            }
                        },
                    ),
                    helpers.job,
                    this.lightdashConfig.scheduler.jobTimeout,
                    async (job, e) => {
                        await this.schedulerService.logSchedulerJob({
                            task: SCHEDULER_TASKS.DOWNLOAD_ASYNC_QUERY_RESULTS,
                            jobId: job.id,
                            scheduledTime: job.run_at,
                            status: SchedulerJobStatus.ERROR,
                            details: {
                                createdByUserUuid: payload.userUuid,
                                error: getErrorMessage(e),
                                projectUuid: payload.projectUuid,
                                organizationUuid: payload.organizationUuid,
                            },
                        });
                    },
                );
            },
            [EE_SCHEDULER_TASKS.APP_GENERATE_PIPELINE]: async (
                payload,
                helpers,
            ) => {
                const schedulerWaitMs = Math.max(
                    Date.now() - helpers.job.run_at.getTime(),
                    0,
                );
                await tryJobOrTimeout(
                    SchedulerClient.processJob(
                        EE_SCHEDULER_TASKS.APP_GENERATE_PIPELINE,
                        helpers.job.id,
                        helpers.job.run_at,
                        payload,
                        async () => {
                            await this.appGenerateService.runPipeline(
                                payload,
                                schedulerWaitMs,
                            );
                        },
                    ),
                    helpers.job,
                    APP_GENERATE_TIMEOUT_MS,
                    async (_job, e) => {
                        const marked = await this.appGenerateService.markError(
                            payload.appUuid,
                            payload.version,
                            e,
                            'Build timed out. Please try again.',
                        );
                        if (marked) {
                            await this.appGenerateService.trackTimeoutFailure(
                                payload,
                                e,
                                schedulerWaitMs,
                            );
                        }
                    },
                );
            },
            [EE_SCHEDULER_TASKS.APP_BUILD_FROM_SOURCE]: async (
                payload,
                helpers,
            ) => {
                await tryJobOrTimeout(
                    SchedulerClient.processJob(
                        EE_SCHEDULER_TASKS.APP_BUILD_FROM_SOURCE,
                        helpers.job.id,
                        helpers.job.run_at,
                        payload,
                        async () => {
                            await this.appGenerateService.runBuildFromSourcePipeline(
                                payload,
                            );
                        },
                    ),
                    helpers.job,
                    APP_GENERATE_TIMEOUT_MS,
                    async (_job, e) => {
                        await this.appGenerateService.markError(
                            payload.appUuid,
                            payload.version,
                            e,
                            'Build timed out. Please try again.',
                        );
                    },
                );
            },
        };
    }
}
