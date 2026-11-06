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
    isRestrictedScope,
    isScopeAuthorizationUnavailable,
    toExploreScopeInfo,
    type ClassifiedExplores,
} from './classifyExplores';
import { listAllCatalogTables } from './listCatalogTables';

const CLASSIFIED_EXPLORES_CACHE_TTL_MS = 5 * 60 * 1000;

export type ExploreQueryDenialReason =
    /** 令牌能力位不够（viewer 角色没有 view Explore）→ 不能跑临时指标查询 */
    | 'no_run_metric_query'
    /** 表在项目里，但当前账号看不到（用户属性 or 客户使用模式白名单） */
    | 'not_visible'
    /** 两张名单里都没有：不在项目、未被索引，或受控角色下的「未开放」 */
    | 'unknown_explore'
    /** 白名单取不到授权数据（RPC 失败 / 缺配置 / 取不到手机号）→ 临时故障 */
    | 'authorization_unavailable';

export type ExploreQueryDenialOptions = {
    /** 强制看板模式：在非受控角色的「表不可见」文案里补一句看板口径 */
    dashboardStrict?: boolean;
};

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
    // 白名单取不到授权数据时，后端会把 /explores 与 dataCatalog 一起清空
    // （ProjectService.filterExploresByViewerAllowList、CatalogService.getFilteredExplores），
    // 此时 attributeDenied 恒为空：必须先按「授权服务不可用」判定，
    // 否则客户会被误报成「没权限 / 表名不对」。
    if (isScopeAuthorizationUnavailable(classified.scope)) {
        return 'authorization_unavailable';
    }
    if (classified.metadataOnly.some((item) => item.name === exploreName)) {
        return 'no_run_metric_query';
    }
    if (classified.attributeDenied.some((item) => item.name === exploreName)) {
        return 'not_visible';
    }
    return 'unknown_explore';
}

/**
 * 预检拒绝文案。两种读者、两套口径（不按身份分支状态，只分支文案）：
 *
 * - 受控角色（`restrictedScope`，客户视角）：只说「没有这张表的权限」，不提「不存在」，
 *   也不把看板/白名单/用户属性这些内部术语抛给客户；给一句「找客服开通」。
 * - 非受控角色（管理员/客服自查）：保留可定位的术语，明确是「没权限」还是「没这张表」，
 *   并给出真正能动手的一步。
 *
 * 每条文案两行：第一行给用户（结论 + 归属），第二行给 agent/客服（`下一步：`）。
 */
export function formatExploreQueryDeniedMessage(
    exploreName: string,
    reason: ExploreQueryDenialReason,
    options: {
        /** true = 受控（白名单生效）；false = 非受控；null / 省略 = 无法判断 */
        restrictedScope?: boolean | null;
        dashboardStrict?: boolean;
    } = {},
): string {
    const quoted = `「${exploreName}」`;
    const restricted = options.restrictedScope === true;
    const scopeUnknown =
        options.restrictedScope !== true && options.restrictedScope !== false;
    const dashboardStrict = options.dashboardStrict === true;
    // 客户只看结论：有权限 / 没权限，以及"找谁开通"。原因、排查手段都放在第二行给 agent / 客服。
    const restrictedDenied = [
        `${quoted}当前不可查询：你的账号没有这张数据表的权限。`,
        '下一步：请联系客服开通权限；开通后从 get_my_access 的 explores.queryable 选表重试。',
    ].join('\n');
    switch (reason) {
        case 'not_visible':
        case 'unknown_explore':
            if (restricted) {
                return restrictedDenied;
            }
            if (scopeUnknown) {
                return [
                    `已拒绝查询${quoted}：当前账号看不到这张表。`,
                    dashboardStrict
                        ? '下一步：先核对表名，并确认它已挂到看板；要摸清可查表，带 projectUuid 调 get_my_access(includeExplores=true)。'
                        : '下一步：先核对表名；要摸清可查表，带 projectUuid 调 get_my_access(includeExplores=true)，仍不可用请联系客服确认权限。',
                ].join('\n');
            }
            if (reason === 'not_visible') {
                return [
                    `已拒绝查询${quoted}：当前账号看不到这张表（用户属性不满足，或该表未进目录 / 编译失败）。`,
                    dashboardStrict
                        ? '下一步：检查该用户的 user attributes 与该表所在看板的授权后重试；get_my_access 可复核能力位与可查表。'
                        : '下一步：检查该用户的 user attributes 后重试；get_my_access 可复核能力位与可查表。',
                ].join('\n');
            }
            return [
                `已拒绝查询${quoted}：该项目没有这张表，或目录尚未索引。`,
                dashboardStrict
                    ? '下一步：确认 dbt 模型名与项目「表选择」设置，等目录索引完成后重试；尚未绑定看板的数据集也会出现在这里。'
                    : '下一步：确认 dbt 模型名与项目「表选择」设置，等目录索引完成后重试。',
            ].join('\n');
        case 'authorization_unavailable':
            return restricted
                ? [
                      `暂时无法确认${quoted}的权限，本次查询已停止。`,
                      '下一步：请稍后重试；持续失败请联系客服。',
                  ].join('\n')
                : [
                      `暂时无法确认${quoted}的查询权限（授权服务不可用），本次查询已停止。`,
                      '下一步：检查 ADMIN_API_HOST / ADMIN_API_KEY 与看板授权服务后重试。',
                  ].join('\n');
        case 'no_run_metric_query':
            return restricted
                ? [
                      `「${exploreName}」暂时不能直接查询：查看者角色不支持临时查询。`,
                      '下一步：请改用已保存的图表 / 看板查询；需要自由查询请联系客服。',
                  ].join('\n')
                : [
                      `已拒绝查询${quoted}：查看者角色不支持临时指标查询。`,
                      '下一步：改用 run_saved_chart / run_dashboard_tiles；需要自由探索请让管理员把项目角色改为交互式查看者。',
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
        // 带 projectUuid 才能拿到 clientUse 诊断（受控 / 非受控角色），用于分流文案
        api.getAuthenticatedUser(apiKey, projectUuid),
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
        toExploreScopeInfo(user.clientUse),
    );
}

export async function loadClassifiedExplores(
    api: LightdashRestClient,
    apiKey: string,
    projectUuid: string,
    options: { forceFresh?: boolean } = {},
): Promise<ClassifiedExplores> {
    const cacheKey = createClassifiedExploresCacheKey(
        apiKey,
        projectUuid,
        getHttpRequestUserAttributesHeader(),
    );
    const now = Date.now();
    const cached = classifiedExploresCache.get(cacheKey);
    if (cached && cached.expiresAtMs > now && options.forceFresh !== true) {
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
    options: ExploreQueryDenialOptions = {},
): Promise<void> {
    const classified = await loadClassifiedExplores(api, apiKey, projectUuid);
    if (exploreQueryDenialReason(classified, exploreName, mode) === null) {
        return;
    }
    // 阻断路径绕过缓存重查一次：客户刚开通看板 / 刚修好属性时，
    // 5 分钟缓存会把「已可查」误判为拒绝（与看板上下文 guard 同一口径）。
    const fresh = await loadClassifiedExplores(api, apiKey, projectUuid, {
        forceFresh: true,
    });
    const reason = exploreQueryDenialReason(fresh, exploreName, mode);
    if (reason === null) {
        return;
    }
    throw new Error(
        formatExploreQueryDeniedMessage(exploreName, reason, {
            restrictedScope: isRestrictedScope(fresh.scope),
            dashboardStrict: options.dashboardStrict,
        }),
    );
}
