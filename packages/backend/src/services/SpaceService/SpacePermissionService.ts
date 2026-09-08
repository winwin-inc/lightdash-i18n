// STUB: SpacePermissionService (direct-access / role-set spaces) not ported
import { type SessionUser } from '@lightdash/common';
import { type Knex } from 'knex';

export type AccessContextForCasl = Record<string, unknown>;

export type AccessTarget = { type: string; [key: string]: unknown };

export type AccessResult<T extends AccessTarget = AccessTarget> = {
    target: T;
    access: unknown[];
    inheritsFromOrgOrProject: boolean;
    context: AccessContextForCasl;
};

export class SpacePermissionService {
    async assertAction(..._args: unknown[]): Promise<void> {}

    async getAccess(..._args: unknown[]): Promise<any> {
        return { access: [] };
    }

    async resolveAccess(..._args: unknown[]): Promise<any> {
        return { access: [], inheritsFromOrgOrProject: true };
    }

    async resolveAccessBatch<T extends AccessTarget>(
        _userUuid: string,
        targets: T[],
        _opts?: { trx?: Knex },
    ): Promise<AccessResult<T>[]> {
        return targets.map((target) => ({
            target,
            access: [],
            inheritsFromOrgOrProject: true,
            context: {},
        }));
    }

    async userCan(_user: SessionUser, ..._args: unknown[]): Promise<boolean> {
        return true;
    }
}
