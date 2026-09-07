/**
 * Instance-level AI copilot config resolver for Data Apps.
 * Passes through `lightdashConfig.ai.copilot` (ANTHROPIC_API_KEY / OPENAI_API_KEY / …).
 * Full BYO org key overlay is not ported yet.
 */
import { ParameterError } from '@lightdash/common';
import type { LanguageModel } from 'ai';
import type { AiKeyManagement } from '../../../analytics/aiUsage';
import type { AiCopilotConfigSchemaType } from '../../../config/aiConfigSchema';
import type { LightdashConfig } from '../../../config/parseConfig';
import type { ClaudeCodeBedrockConfig } from '../AppGenerateService/claudeCodeEnv';
import { getModel, resolveKeyManagement } from './models';

/**
 * Structurally compatible with ClaudeCodeProviderConfig & CodexProviderConfig
 * so it can be passed straight into buildClaudeCodeEnv / buildCodexCodeEnv.
 */
export type CopilotConfig = AiCopilotConfigSchemaType & {
    providers: AiCopilotConfigSchemaType['providers'] & {
        bedrock?: ClaudeCodeBedrockConfig;
    };
};

export type ResolvedCopilotConfig = CopilotConfig & {
    byoProviders: string[];
};

type Dependencies = {
    lightdashConfig: LightdashConfig;
};

export class OrgAiCopilotConfigResolver {
    private readonly lightdashConfig: LightdashConfig;

    constructor(dependencies: Dependencies) {
        this.lightdashConfig = dependencies.lightdashConfig;
    }

    private instanceConfig(): ResolvedCopilotConfig {
        const base = this.lightdashConfig.ai.copilot as CopilotConfig;
        return { ...base, byoProviders: [] };
    }

    async resolve(
        _organizationUuid?: string | null,
    ): Promise<ResolvedCopilotConfig> {
        return this.instanceConfig();
    }

    async getCopilotConfig(
        organizationUuid?: string | null,
    ): Promise<ResolvedCopilotConfig> {
        return this.resolve(organizationUuid);
    }

    async getClaudeCodeConfig(
        organizationUuid?: string | null,
    ): Promise<ResolvedCopilotConfig> {
        return this.resolve(organizationUuid);
    }

    async getCodexConfig(
        organizationUuid?: string | null,
    ): Promise<ResolvedCopilotConfig> {
        const config = await this.resolve(organizationUuid);
        return {
            ...config,
            defaultProvider: 'openai',
        };
    }

    async getDataAppModelVisibility(
        ..._args: unknown[]
    ): Promise<Record<string, unknown> | null> {
        return null;
    }

    async resolveFastModel(
        config: CopilotConfig,
        _options?: { enableReasoning?: boolean },
    ): Promise<{
        model: LanguageModel;
        callOptions?: Record<string, unknown>;
        providerOptions?: any;
        keyManagement: AiKeyManagement;
        provider?: string;
    }> {
        if (!config.providers[config.defaultProvider]) {
            throw new ParameterError(
                `No AI provider configured for defaultProvider "${config.defaultProvider}". Set ANTHROPIC_API_KEY or OPENAI_API_KEY.`,
            );
        }

        const resolved = getModel(config);
        return {
            ...resolved,
            keyManagement: resolveKeyManagement(config, config.defaultProvider),
            provider: config.defaultProvider,
        };
    }
}
