import { OrganizationMemberRole } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { buildProfileEvent, fingerprint, type ProfileUser } from './profile';

const makeUser = (overrides: Partial<ProfileUser> = {}): ProfileUser => ({
    userUuid: 'u-1111',
    email: 'demo@lightdash.com',
    firstName: '张',
    lastName: '三',
    organizationUuid: 'org-2222',
    organizationName: '番马互娱（中文组织名）',
    role: OrganizationMemberRole.ADMIN,
    isTrialAccount: false,
    createdAt: '2026-01-02T03:04:05.000Z',
    ...overrides,
});

describe('buildProfileEvent', () => {
    it('字段齐全：13 键 + client 固定 web', () => {
        const payload = buildProfileEvent({
            user: makeUser(),
            projectId: 'p-3333',
            projectName: '示例项目',
            appVersion: '1.2.3',
            env: 'production',
        });
        expect(payload).toEqual({
            user_uuid: 'u-1111',
            user_email: 'demo@lightdash.com',
            user_name: '张 三',
            org_id: 'org-2222',
            org_name: '番马互娱（中文组织名）',
            org_role: 'admin',
            is_trial_account: 'false',
            user_created_at: '2026-01-02',
            project_id: 'p-3333',
            project_name: '示例项目',
            client: 'web',
            app_version: '1.2.3',
            env: 'production',
        });
        expect(Object.keys(payload)).toHaveLength(13);
    });

    it('空值不写：缺组织/邮箱/项目名/版本的键不出现', () => {
        const payload = buildProfileEvent({
            user: makeUser({
                email: undefined,
                organizationUuid: undefined,
                organizationName: undefined,
                role: undefined,
            }),
            projectId: null,
            projectName: null,
            appVersion: null,
            env: null,
        });
        expect(payload.user_email).toBeUndefined();
        expect(payload.org_id).toBeUndefined();
        expect(payload.org_name).toBeUndefined();
        expect(payload.org_role).toBeUndefined();
        expect(payload.project_id).toBeUndefined();
        expect(payload.project_name).toBeUndefined();
        expect(payload.app_version).toBeUndefined();
        expect(payload.env).toBeUndefined();
        // 恒定键仍在
        expect(payload.user_uuid).toBe('u-1111');
        expect(payload.client).toBe('web');
        expect(payload.is_trial_account).toBe('false');
    });

    it('is_trial_account 布尔转字符串', () => {
        const payload = buildProfileEvent({
            user: makeUser({ isTrialAccount: true }),
            projectId: null,
            projectName: null,
            appVersion: null,
            env: null,
        });
        expect(payload.is_trial_account).toBe('true');
    });

    it('中文名字段按码点截断 100', () => {
        const longOrgName = '番'.repeat(120);
        const payload = buildProfileEvent({
            user: makeUser({ organizationName: longOrgName }),
            projectId: null,
            projectName: null,
            appVersion: null,
            env: null,
        });
        expect(Array.from(payload.org_name as string).length).toBe(100);
    });

    it('user_created_at 支持 Date 与 ISO 字符串两种输入', () => {
        const fromString = buildProfileEvent({
            user: makeUser({ createdAt: '2026-01-02T03:04:05.000Z' }),
            projectId: null,
            projectName: null,
            appVersion: null,
            env: null,
        });
        const fromDate = buildProfileEvent({
            user: makeUser({ createdAt: new Date('2026-01-02T03:04:05.000Z') }),
            projectId: null,
            projectName: null,
            appVersion: null,
            env: null,
        });
        expect(fromString.user_created_at).toBe('2026-01-02');
        expect(fromDate.user_created_at).toBe('2026-01-02');
    });
});

describe('fingerprint', () => {
    it('指纹格式：user_uuid|org_id|org_role|project_id', () => {
        expect(fingerprint(makeUser(), 'p-3333')).toBe(
            'u-1111|org-2222|admin|p-3333',
        );
    });

    it('相同输入指纹相同（provider 判重后不重发）', () => {
        const user = makeUser();
        expect(fingerprint(user, 'p-1')).toBe(fingerprint(makeUser(), 'p-1'));
    });

    it('任一身份维度变化 → 指纹变化', () => {
        const base = fingerprint(makeUser(), 'p-1');
        expect(
            fingerprint(
                makeUser({ role: OrganizationMemberRole.VIEWER }),
                'p-1',
            ),
        ).not.toBe(base);
        expect(fingerprint(makeUser({ organizationUuid: 'org-x' }), 'p-1')).not.toBe(base);
        expect(fingerprint(makeUser({ userUuid: 'u-2' }), 'p-1')).not.toBe(base);
        expect(fingerprint(makeUser(), 'p-2')).not.toBe(base);
    });

    it('空组织/角色/项目以空段占位，仍可判等', () => {
        const user = makeUser({
            organizationUuid: undefined,
            role: undefined,
        });
        expect(fingerprint(user, null)).toBe('u-1111|||');
        expect(fingerprint(user, null)).toBe(
            fingerprint(
                makeUser({ organizationUuid: undefined, role: undefined }),
                null,
            ),
        );
    });
});
