import type { LightdashMcpEnvConfig } from '../config';
import { createAsyncQueryMethods } from './asyncQueryPoll';
import { createEndpointMethods } from './endpoints';
import { createRequestJson } from './requestBase';

export function createLightdashRestClient(config: LightdashMcpEnvConfig) {
    const requestJson = createRequestJson(config.baseUrl);
    const asyncPart = createAsyncQueryMethods(requestJson, config.maxLimit);
    const endpointsPart = createEndpointMethods(requestJson);
    return { ...endpointsPart, ...asyncPart };
}

export type LightdashRestClient = ReturnType<typeof createLightdashRestClient>;
