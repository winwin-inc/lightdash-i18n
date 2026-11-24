/**
 * Umami 埋点 Provider（docs/ops/umami-analytics.md §5.2）。
 *
 * - 读 health.umami（enabled/endpoint/project/token），未启用或配置不齐 →
 *   零网络，直接渲染 children
 * - 一次导航只发 1 个请求：data_list 装 page_view + $AppViewScreen 两条
 * - 首屏等 user resolve 后再发，避免匿名 distinct_id 产生双份 UV
 * - 幂等：location.key 相同不重发
 * - profile_set：用户就绪首帧 + 身份指纹变化时各发一次（单独 data= 一包）
 * - 不 import TrackingProvider / rudder-sdk；所有网络失败静默
 */

import { type HealthState } from '@lightdash/common';
import {
    useEffect,
    useRef,
    useState,
    type FC,
    type PropsWithChildren,
} from 'react';
import { useLocation } from 'react-router';
import useApp from '../../App/useApp';
import { toPageEvent } from './pageKey';
import { getPageTitle } from './pageTitle';
import { buildProfileEvent, fingerprint } from './profile';
import { getInstallId, getSessionId } from './session';
import {
    encodeBatchBody,
    encodeBody,
    send,
    type UmamiSendConfig,
} from './transport';

// 后端 HealthState.umami 并入前的最小本地类型（后端落地后该交叉类型仍兼容）
export type UmamiHealthConfig = {
    enabled: boolean;
    endpoint: string;
    project: string;
    token: string;
};

type HealthStateWithUmami = HealthState & { umami?: UmamiHealthConfig };

const LIB_NAME = 'lightdash-web';

const hasText = (value: string | null | undefined): value is string =>
    typeof value === 'string' && value.length > 0;

/** 组属性：空值不写；布尔一律转字符串 'true'/'false' */
const compact = (
    properties: Record<string, string | boolean | null | undefined>,
): Record<string, string> => {
    const result: Record<string, string> = {};
    Object.entries(properties).forEach(([key, value]) => {
        if (value === null || value === undefined || value === '') return;
        result[key] =
            typeof value === 'boolean' ? (value ? 'true' : 'false') : value;
    });
    return result;
};

const displayName = (user: {
    firstName: string;
    lastName: string;
}): string => `${user.firstName} ${user.lastName}`.trim();

const UmamiProviderMain: FC<PropsWithChildren> = ({ children }) => {
    const { health, user } = useApp();
    const location = useLocation();

    const [config, setConfig] = useState<UmamiSendConfig | null>(null);
    const lastLocationKeyRef = useRef<string | null>(null);
    const lastFingerprintRef = useRef<string | null>(null);

    const appVersion = hasText(health.data?.version)
        ? health.data.version
        : null;
    const env = health.data?.mode ?? null;

    // 配置就绪后 setConfig（值不变时保持同一引用，避免下游 effect 空转）
    useEffect(() => {
        const umami = (health.data as HealthStateWithUmami | undefined)
            ?.umami;
        if (
            umami === undefined ||
            umami.enabled !== true ||
            !hasText(umami.endpoint) ||
            !hasText(umami.project) ||
            !hasText(umami.token)
        ) {
            return;
        }
        setConfig((previous) =>
            previous !== null &&
            previous.endpoint === umami.endpoint &&
            previous.project === umami.project &&
            previous.token === umami.token
                ? previous
                : {
                      endpoint: umami.endpoint,
                      project: umami.project,
                      token: umami.token,
                  },
        );
    }, [health.data]);

    // 首屏必须等 user resolve（isAuthenticated 时不早发匿名事件）；
    // 未登录页（health.isAuthenticated=false）无需等待。
    // 兜底：isAuthenticated=true 但 account 不是注册用户时，user query 会被禁用
    // 而永远停留在 loading（getUser 的 enabled: isRegisteredUser()），
    // 这种形态下整段会话发不出任何 PV——用一次超时把它视为 settled。
    const isAuthenticated = health.data?.isAuthenticated === true;
    const [userSettledByTimeout, setUserSettledByTimeout] = useState(false);
    useEffect(() => {
        if (!isAuthenticated || user.isSuccess || user.isError) {
            return undefined;
        }
        const timer = setTimeout(() => setUserSettledByTimeout(true), 1500);
        return () => clearTimeout(timer);
    }, [isAuthenticated, user.isSuccess, user.isError]);
    const userHasSettled = user.isSuccess || user.isError || userSettledByTimeout;
    const canSend =
        health.data !== undefined && (!isAuthenticated || userHasSettled);

    // 一次导航一条请求：page_view + $AppViewScreen 双发（data_list 2 条）
    useEffect(() => {
        if (config === null || !canSend) return;
        // 幂等：同一 location.key 不重发
        if (lastLocationKeyRef.current === location.key) return;
        lastLocationKeyRef.current = location.key;

        const pageEvent = toPageEvent(location.pathname);
        const installId = getInstallId();
        const sessionId = getSessionId();
        const userData = user.data;
        const distinctId =
            userData !== undefined && hasText(userData.userUuid)
                ? userData.userUuid
                : `anon:${installId}`;
        const anonymousId = `anon:${installId}`;
        const lib = { $lib: LIB_NAME, $lib_version: appVersion ?? '' };
        const identities = {
            user_key: distinctId,
            $identity_cookie_id: installId,
        };

        const commonProperties = compact({
            user_uuid: userData?.userUuid ?? null,
            user_email: userData?.email ?? null,
            user_name: userData === undefined ? null : displayName(userData),
            org_id: userData?.organizationUuid ?? null,
            org_name: userData?.organizationName ?? null,
            client: 'web',
            app_version: appVersion,
            env,
        });

        const pageViewProperties = compact({
            ...commonProperties,
            page: pageEvent.page,
            route: pageEvent.route,
            project_id: pageEvent.project_id,
            dashboard_id: pageEvent.dashboard_id,
            chart_id: pageEvent.chart_id,
            space_id: pageEvent.space_id,
            settings_section: pageEvent.settings_section,
            is_embed: pageEvent.is_embed,
            is_authenticated: userData !== undefined,
            $url: pageEvent.route,
            $title: getPageTitle(pageEvent.page),
            // 模板路径：绝不用 location.pathname，避免把 reset/invite 的 nanoid 凭据写进埋点
            $url_path: pageEvent.route,
            $event_session_id: sessionId,
        });

        const pageViewEvent = {
            distinct_id: distinctId,
            anonymous_id: anonymousId,
            time: Date.now(),
            type: 'track',
            event: 'page_view',
            lib,
            identities,
            properties: pageViewProperties,
        };
        const appViewScreenEvent = {
            distinct_id: distinctId,
            anonymous_id: anonymousId,
            time: Date.now(),
            type: 'track',
            event: '$AppViewScreen',
            lib,
            identities,
            properties: compact({
                $url: pageEvent.route,
                $title: getPageTitle(pageEvent.page),
            }),
        };

        send(config, encodeBatchBody([pageViewEvent, appViewScreenEvent]));
    }, [appVersion, canSend, config, env, location.key, location.pathname, user.data]);

    // profile_set：用户就绪首帧 + 指纹变化各发一次（低频，单独 data= 一包）
    useEffect(() => {
        if (config === null) return;
        const userData = user.data;
        if (userData === undefined) return; // 只在登录态发
        const projectId = toPageEvent(location.pathname).project_id;
        const currentFingerprint = fingerprint(userData, projectId);
        if (lastFingerprintRef.current === currentFingerprint) return;
        lastFingerprintRef.current = currentFingerprint;

        const installId = getInstallId();
        send(
            config,
            encodeBody({
                distinct_id: userData.userUuid,
                anonymous_id: `anon:${installId}`,
                time: Date.now(),
                type: 'track',
                event: 'profile_set',
                lib: { $lib: LIB_NAME, $lib_version: appVersion ?? '' },
                identities: {
                    user_key: userData.userUuid,
                    $identity_cookie_id: installId,
                },
                properties: buildProfileEvent({
                    user: userData,
                    projectId,
                    projectName: null, // 项目名后端事件携带；前端路由只有 uuid
                    appVersion,
                    env,
                }),
            }),
        );
    }, [appVersion, config, env, location.pathname, user.data]);

    // 清理：未注册任何监听（页面隐藏改用 sendBeacon 由 transport 内部判断），
    // 卸载时无需额外清理
    return <>{children}</>;
};

export const UmamiProvider: FC<PropsWithChildren> = ({ children }) => (
    <UmamiProviderMain>{children}</UmamiProviderMain>
);

export default UmamiProvider;
