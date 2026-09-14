import {
    AiAgentEvalRunJobPayload,
    AppBuildFromSourceJobPayload,
    AppGeneratePipelineJobPayload,
    EE_SCHEDULER_TASKS,
    SlackPromptJobPayload,
} from '@lightdash/common';
import { SchedulerClient } from '../../scheduler/SchedulerClient';

export class CommercialSchedulerClient extends SchedulerClient {
    async slackAiPrompt(payload: SlackPromptJobPayload) {
        const graphileClient = await this.graphileUtils;
        const now = new Date();
        const { id: jobId } = await graphileClient.addJob(
            EE_SCHEDULER_TASKS.SLACK_AI_PROMPT,
            payload,
            {
                runAt: now, // now
                maxAttempts: 1,
            },
        );
        return { jobId };
    }

    async aiAgentEvalResult(payload: AiAgentEvalRunJobPayload) {
        const graphileClient = await this.graphileUtils;
        const now = new Date();
        const { id: jobId } = await graphileClient.addJob(
            EE_SCHEDULER_TASKS.AI_AGENT_EVAL_RESULT,
            payload,
            {
                runAt: now, // now
                maxAttempts: 1,
            },
        );
        return { jobId };
    }

    async appGeneratePipeline(payload: AppGeneratePipelineJobPayload) {
        const graphileClient = await this.graphileUtils;
        const { id: jobId } = await graphileClient.addJob(
            EE_SCHEDULER_TASKS.APP_GENERATE_PIPELINE,
            payload,
            {
                runAt: new Date(),
                maxAttempts: 2,
                jobKey: `app-generate:${payload.appUuid}:${payload.version}`,
            },
        );
        return { jobId };
    }

    async appBuildFromSource(payload: AppBuildFromSourceJobPayload) {
        const graphileClient = await this.graphileUtils;
        const { id: jobId } = await graphileClient.addJob(
            EE_SCHEDULER_TASKS.APP_BUILD_FROM_SOURCE,
            payload,
            {
                runAt: new Date(),
                maxAttempts: 2,
                jobKey: `app-build:${payload.appUuid}:${payload.version}`,
            },
        );
        return { jobId };
    }
}
