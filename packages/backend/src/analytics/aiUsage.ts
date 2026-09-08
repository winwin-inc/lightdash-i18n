// STUB: minimal AI usage helpers for AppGenerateService compile
// Align with upstream string-union AiKeyManagement.
export type AiKeyManagement = 'lightdash-managed' | 'self-managed';

export type AiUsageTokens = {
    inputTokens: number | null;
    outputTokens: number | null;
    cacheReadTokens: number | null;
    cacheWriteTokens: number | null;
    reasoningTokens: number | null;
    totalTokens: number | null;
};

export function emitAiUsage(..._args: unknown[]): void {
    // STUB no-op
}

export function languageModelUsageToTokens(_usage: unknown): AiUsageTokens {
    return {
        inputTokens: null,
        outputTokens: null,
        cacheReadTokens: null,
        cacheWriteTokens: null,
        reasoningTokens: null,
        totalTokens: null,
    };
}
