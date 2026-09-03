import { assertUnreachable, ParameterError } from '@lightdash/common';
import type { AiKeyManagement } from '../../../../analytics/aiUsage';
import { LightdashConfig } from '../../../../config/parseConfig';
import { getAnthropicModel } from './anthropic-claude';
import { getAzureGpt41Model } from './azure-openai-gpt-4.1';
import { getOpenaiGptmodel } from './openai-gpt';
import { getOpenRouterModel } from './openrouter';

export type { AiKeyManagement } from '../../../../analytics/aiUsage';

/** STUB: BYO key-management tagging — port full version from upstream later */
export const resolveKeyManagement = (
    _config: unknown,
    _provider: string,
): AiKeyManagement => 'lightdash-managed';

export const getModel = (config: LightdashConfig['ai']['copilot']) => {
    switch (config.defaultProvider) {
        case 'openai': {
            const openaiConfig = config.providers.openai;
            if (!openaiConfig) {
                throw new ParameterError('OpenAI configuration is required');
            }
            return getOpenaiGptmodel(openaiConfig);
        }
        case 'azure': {
            const azureConfig = config.providers.azure;
            if (!azureConfig) {
                throw new ParameterError('Azure configuration is required');
            }
            return getAzureGpt41Model(azureConfig);
        }
        case 'anthropic': {
            const anthropicConfig = config.providers.anthropic;
            if (!anthropicConfig) {
                throw new ParameterError('Anthropic configuration is required');
            }
            return getAnthropicModel(anthropicConfig);
        }
        case 'openrouter': {
            const openrouterConfig = config.providers.openrouter;
            if (!openrouterConfig) {
                throw new ParameterError(
                    'OpenRouter configuration is required',
                );
            }
            return getOpenRouterModel(openrouterConfig);
        }
        default:
            return assertUnreachable(
                config.defaultProvider,
                'Invalid provider',
            );
    }
};
