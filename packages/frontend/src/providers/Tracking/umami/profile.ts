/**
 * profile_set 事件载荷（docs/ops/umami-analytics.md §4.3，13 键）。
 *
 * - 空值不写（组织未建、邮箱缺失等场景属性缺省）
 * - 中文名字段按码点截断 100（utf8 安全，不产生乱码）
 * - 布尔转字符串 'true'/'false'
 * - fingerprint(user, projectId) 供 provider 判重：
 *   指纹（user_uuid|org_id|org_role|project_id）相同不重发
 */

import type { LightdashUser } from '@lightdash/common';
import { truncateByCodePoints } from './transport';

const FIELD_MAX_CODE_POINTS = 100;
const CLIENT_WEB = 'web';

/** 与 LightdashUser 结构对齐（createdAt 在 API 层实际是 ISO 字符串；可选字段镜像上游可选属性） */
export type ProfileUser = {
    userUuid: LightdashUser['userUuid'];
    email: LightdashUser['email'];
    firstName: LightdashUser['firstName'];
    lastName: LightdashUser['lastName'];
    organizationUuid?: LightdashUser['organizationUuid'];
    organizationName?: LightdashUser['organizationName'];
    role?: LightdashUser['role'];
    isTrialAccount: LightdashUser['isTrialAccount'];
    createdAt: Date | string;
};

export type ProfileEventInput = {
    user: ProfileUser;
    projectId: string | null;
    projectName: string | null;
    appVersion: string | null;
    env: string | null;
};

export type ProfilePayload = Record<string, string>;

const hasValue = (value: string | null | undefined): value is string =>
    value !== null && value !== undefined && value !== '';

const toDateOnly = (value: Date | string): string => {
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    return value.slice(0, 10);
};

const truncateField = (value: string): string =>
    truncateByCodePoints(value, FIELD_MAX_CODE_POINTS);

export const buildProfileEvent = (
    input: ProfileEventInput,
): ProfilePayload => {
    const { user } = input;
    const payload: ProfilePayload = {};

    if (hasValue(user.userUuid)) payload.user_uuid = user.userUuid;
    if (hasValue(user.email))
        payload.user_email = truncateField(user.email);
    const userName = `${user.firstName} ${user.lastName}`.trim();
    if (hasValue(userName)) payload.user_name = truncateField(userName);
    if (hasValue(user.organizationUuid)) payload.org_id = user.organizationUuid;
    if (hasValue(user.organizationName))
        payload.org_name = truncateField(user.organizationName);
    if (hasValue(user.role)) payload.org_role = user.role;
    payload.is_trial_account = user.isTrialAccount ? 'true' : 'false';
    if (user.createdAt !== undefined && user.createdAt !== null)
        payload.user_created_at = toDateOnly(user.createdAt);
    if (hasValue(input.projectId)) payload.project_id = input.projectId;
    if (hasValue(input.projectName))
        payload.project_name = truncateField(input.projectName);
    payload.client = CLIENT_WEB;
    if (hasValue(input.appVersion)) payload.app_version = input.appVersion;
    if (hasValue(input.env)) payload.env = input.env;

    return payload;
};

/**
 * 身份指纹：user_uuid|org_id|org_role|project_id。
 * 相同输入 → 相同指纹（provider 据此判重，只发一次）。
 */
export const fingerprint = (
    user: ProfileUser,
    projectId: string | null,
): string =>
    `${user.userUuid}|${user.organizationUuid ?? ''}|${
        user.role ?? ''
    }|${projectId ?? ''}`;
