// STUB: Organization designs not fully ported
import { Knex } from 'knex';

export class OrganizationDesignModel {
    constructor(_args: { database: Knex }) {}

    async getDesign(..._args: unknown[]): Promise<any> {
        return null;
    }

    async getActiveDesign(..._args: unknown[]): Promise<any> {
        return null;
    }

    async getDesignByUuid(..._args: unknown[]): Promise<any> {
        return null;
    }

    async findInOrganization(..._args: unknown[]): Promise<any> {
        return null;
    }

    async getDefault(_organizationUuid: string): Promise<any | null> {
        return null;
    }
}
