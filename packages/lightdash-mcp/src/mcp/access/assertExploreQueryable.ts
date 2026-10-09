import { createHash } from 'node:crypto';
import { getHttpRequestUserAttributesHeader } from '../../lib/requestContext';
import type { LightdashRestClient } from '../../rest/lightdashRest';
import {
    capabilitiesFromRules,
    mergeCapabilities,
    parseAbilityRules,
} from './abilityFromRules';
import {
    classifyExplores,
    collectExploreAccessItems,
    type ClassifiedExplores,
} from './classifyExplores';
import { listAllCatalogTables } from './listCatalogTables';

const CLASSIFIED_EXPLORES_CACHE_TTL_MS = 5 * 60 * 1000;

export type ExploreQueryDenialReason =
    | 'no_run_metric_query'
    | 'attribute_denied'
    | 'unknown_explore';

export type ExploreAccessCheckMode = 'metric' | 'fieldValues';

type ClassifiedExploresCacheEntry = {
    expiresAtMs: number;
    classified: ClassifiedExplores;
};

const classifiedExploresCache = new Map<string, ClassifiedExploresCacheEntry>();

function asRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return null;
    }
    return value as Record<string, unknown>;
}

export function createClassifiedExploresCacheKey(
    apiKey: string,
    projectUuid: string,
    userAttributesHeader: string | undefined,
): string {
    const authorizationHash = createHash('sha256')
        .update(apiKey, 'utf8')
        .update('\0', 'utf8')
        .update(userAttributesHeader ?? '', 'utf8')
        .digest('hex');
    return `${authorizationHash}:${projectUuid}`;
}

export function resetClassifiedExploresCacheForTests(): void {
    classifiedExploresCache.clear();
}

export function exploreQueryDenialReason(
    classified: ClassifiedExplores,
    exploreName: string,
    mode: ExploreAccessCheckMode = 'metric',
): ExploreQueryDenialReason | null {
    if (classified.queryable.some((item) => item.name === exploreName)) {
        return null;
    }
    if (
        mode === 'fieldValues' &&
        classified.metadataOnly.some((item) => item.name === exploreName)
    ) {
        return null;
    }
    if (classified.attributeDenied.some((item) => item.name === exploreName)) {
        return 'attribute_denied';
    }
    if (classified.metadataOnly.some((item) => item.name === exploreName)) {
        return 'no_run_metric_query';
    }
    return 'unknown_explore';
}

export function formatExploreQueryDeniedMessage(
    exploreName: string,
    reason: ExploreQueryDenialReason,
): string {
    const quoted = `「${exploreName}」`;
    switch (reason) {
        case 'attribute_denied':
            return [
                `已拒绝查询${quoted}：当前令牌没有该表的查询权限（用户属性不满足）。`,
                '请先 get_my_access(projectUuid, includeExplores=true)，只从 explores.queryable 选表。',
            ].join('\n');
        case 'no_run_metric_query':
            return [
                `已拒绝查询${quoted}：当前项目角色不能跑临时指标查询。`,
                '请先 get_my_access 确认 effectiveCapabilities.runMetricQuery，或改用 run_saved_chart。',
            ].join('\n');
        case 'unknown_explore':
            return [
                `已拒绝查询${quoted}：该表不存在或不在当前项目可访问表中。`,
                '请先 get_my_access(projectUuid, includeExplores=true)，只从 explores.queryable 选表。',
            ].join('\n');
        default: {
            const exhaustive: never = reason;
            return exhaustive;
        }
    }
}

async function fetchClassifiedExplores(
    api: LightdashRestClient,
    apiKey: string,
    projectUuid: string,
): Promise<ClassifiedExplores> {
    const [userRaw, exploresRaw, catalogRaw] = await Promise.all([
        api.getAuthenticatedUser(apiKey),
        api.listExplores(apiKey, projectUuid, true),
        listAllCatalogTables(api, apiKey, projectUuid),
    ]);
    const user = asRecord(userRaw) ?? {};
    const rules = parseAbilityRules(user.abilityRules);
    const organizationCapabilities = capabilitiesFromRules(rules, {
        type: 'org',
    });
    const projectCapabilities = capabilitiesFromRules(rules, {
        type: 'project',
        projectUuid,
    });
    const effectiveCapabilities = mergeCapabilities(
        organizationCapabilities,
        projectCapabilities,
    );
    return classifyExplores(
        collectExploreAccessItems(exploresRaw),
        collectExploreAccessItems(catalogRaw),
        effectiveCapabilities.runMetricQuery,
    );
}

export async function loadClassifiedExplores(
    api: LightdashRestClient,
    apiKey: string,
    projectUuid: string,
): Promise<ClassifiedExplores> {
    const cacheKey = createClassifiedExploresCacheKey(
        apiKey,
        projectUuid,
        getHttpRequestUserAttributesHeader(),
    );
    const now = Date.now();
    const cached = classifiedExploresCache.get(cacheKey);
    if (cached && cached.expiresAtMs > now) {
        return cached.classified;
    }
    const classified = await fetchClassifiedExplores(api, apiKey, projectUuid);
    classifiedExploresCache.set(cacheKey, {
        classified,
        expiresAtMs: now + CLASSIFIED_EXPLORES_CACHE_TTL_MS,
    });
    return classified;
}

export async function assertExploreQueryable(
    api: LightdashRestClient,
    apiKey: string,
    projectUuid: string,
    exploreName: string,
    mode: ExploreAccessCheckMode = 'metric',
): Promise<void> {
    const classified = await loadClassifiedExplores(api, apiKey, projectUuid);
    const reason = exploreQueryDenialReason(classified, exploreName, mode);
    if (reason === null) {
        return;
    }
    throw new Error(formatExploreQueryDeniedMessage(exploreName, reason));
}
