import {
    isOrganizationMemberRole,
    type OrganizationMemberRole,
} from './organizationMemberProfile';

/**
 * Admin API body for provisioning (creating/updating) an organization user
 * with OIDC identity binding. Issuer is resolved server-side from OIDC config.
 *
 * Lookup key: email (normalized trim + lowercase).
 *
 * Field semantics:
 * - Create (created: true): omitted isActive / isSetupComplete /
 *   verifyEmail / invalidateInvite default to true. firstName /
 *   lastName / subject are required.
 * - Update (existing user): omitted isActive / isSetupComplete /
 *   verifyEmail / invalidateInvite / names keep previous values (no
 *   forced defaults). subject remains required for OIDC bind. role is
 *   only changed when explicitly provided.
 *
 * firstName/lastName are optional in the type so update can omit them;
 * create path enforces them in UserService.
 */
export type ProvisionOrganizationUser = {
    email: string;
    /** Required on create; on update omit to keep existing name. */
    firstName?: string;
    /** Required on create; on update omit to keep existing name. */
    lastName?: string;
    /** External OIDC subject / user_id */
    subject: string;
    /**
     * @default true on create
     * On update: omit to keep previous value.
     */
    isActive?: boolean;
    /**
     * @default true on create
     * On update: omit to keep previous value.
     */
    isSetupComplete?: boolean;
    /**
     * @default true on create
     * On update: omit to skip email verification (do not re-verify).
     */
    verifyEmail?: boolean;
    /**
     * Organization role. On create, defaults to member when omitted.
     * On update, role is only changed when explicitly provided.
     * Demoting the last organization admin is refused (403).
     */
    role?: OrganizationMemberRole;
    /**
     * @default true on create
     * On update: omit to leave existing invite links untouched.
     */
    invalidateInvite?: boolean;
};

export type ProvisionOrganizationUserResult = {
    userUuid: string;
    email: string;
    created: boolean;
    openidLinked: boolean;
    inviteInvalidated: boolean;
    isActive: boolean;
};

export type ApiProvisionOrganizationUserResponse = {
    status: 'ok';
    results: ProvisionOrganizationUserResult;
};

export type ProvisionOrganizationUserBatchItemResult =
    | (ProvisionOrganizationUserResult & { email: string; ok: true })
    | { email: string; ok: false; error: string };

export type ProvisionOrganizationUsersBatch = {
    users: ProvisionOrganizationUser[];
};

export type ApiProvisionOrganizationUsersBatchResponse = {
    status: 'ok';
    results: ProvisionOrganizationUserBatchItemResult[];
};

export const PROVISION_ORGANIZATION_USERS_BATCH_MAX = 100;

export const isProvisionOrganizationUser = (
    value: unknown,
): value is ProvisionOrganizationUser => {
    if (typeof value !== 'object' || value === null) {
        return false;
    }
    const v = value as Record<string, unknown>;
    if (typeof v.email !== 'string' || typeof v.subject !== 'string') {
        return false;
    }
    if (v.firstName !== undefined && typeof v.firstName !== 'string') {
        return false;
    }
    if (v.lastName !== undefined && typeof v.lastName !== 'string') {
        return false;
    }
    if (v.role !== undefined && typeof v.role === 'string') {
        return isOrganizationMemberRole(v.role);
    }
    if (v.role !== undefined) {
        return false;
    }
    return true;
};
