// STUB: full OrgAiCopilotConfigResolver (BYO AI config DB) not ported.
// Signatures match AppGenerateService / claudeCodeEnv / codexCodeEnv call sites.
import type { LanguageModel } from 'ai';
import type { AiKeyManagement } from '../../../analytics/aiUsage';
import type { ClaudeCodeBedrockConfig } from '../AppGenerateService/claudeCodeEnv';

/**
 * Structurally compatible with ClaudeCodeProviderConfig & CodexProviderConfig
 * so it can be passed straight into buildClaudeCodeEnv / buildCodexCodeEnv.
 */
export type CopilotConfig = {
    providers: {
        openai?: {
            apiKey: string;
            modelName: string;
            baseUrl?: string;
        };
        anthropic?: {
            apiKey: string;
            baseUrl?: string;
        };
        azure?: { apiKey: string; [key: string]: unknown };
        openrouter?: { apiKey: string; [key: string]: unknown };
        bedrock?: ClaudeCodeBedrockConfig;
    };
    /** Required so config is assignable to ClaudeCode / Codex provider configs */
    defaultProvider: string;
    enabled?: boolean;
};

export type ResolvedCopilotConfig = CopilotConfig & {
    byoProviders: string[];
};

const emptyResolved = (defaultProvider: string): ResolvedCopilotConfig => ({
    providers: {},
    defaultProvider,
    byoProviders: [],
});

export class OrgAiCopilotConfigResolver {
    constructor(_args: unknown) {}

    async resolve(..._args: unknown[]): Promise<ResolvedCopilotConfig> {
        return emptyResolved('anthropic');
    }

    async getCopilotConfig(
        ..._args: unknown[]
    ): Promise<ResolvedCopilotConfig> {
        return this.resolve();
    }

    async getClaudeCodeConfig(
        ..._args: unknown[]
    ): Promise<ResolvedCopilotConfig> {
        return emptyResolved('anthropic');
    }

    async getCodexConfig(..._args: unknown[]): Promise<ResolvedCopilotConfig> {
        return emptyResolved('openai');
    }

    async getDataAppModelVisibility(
        ..._args: unknown[]
    ): Promise<Record<string, unknown> | null> {
        return null;
    }

    async resolveFastModel(..._args: unknown[]): Promise<{
        model: LanguageModel;
        callOptions?: Record<string, unknown>;
        providerOptions?: any;
        keyManagement: AiKeyManagement;
        provider?: string;
    }> {
        // Runtime unused until full AI BYO config is ported; cast for compile.
        return {
            model: null as any as LanguageModel,
            callOptions: {},
            providerOptions: undefined,
            keyManagement: 'lightdash-managed',
            provider: 'anthropic',
        };
    }
}
