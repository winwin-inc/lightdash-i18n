// STUB: External connections not fully ported — methods return empty/safe defaults.
// Port full implementation from upstream when externalConnections DB entities land.
import { Knex } from 'knex';

export class ExternalConnectionModel {
    constructor(_args?: { database?: Knex; encryptionUtil?: unknown }) {}

    async get(..._args: unknown[]): Promise<any> {
        return null;
    }

    async find(..._args: unknown[]): Promise<any[]> {
        return [];
    }

    async getByUuid(..._args: unknown[]): Promise<any> {
        return null;
    }

    async findByUuid(_uuid: string): Promise<any | undefined> {
        return undefined;
    }

    async findBySlug(..._args: unknown[]): Promise<any | undefined> {
        return undefined;
    }

    async getBrowserImageOrigins(..._args: unknown[]): Promise<string[]> {
        return [];
    }

    async listAppLinks(..._args: unknown[]): Promise<any[]> {
        return [];
    }

    async replaceAppLinks(..._args: unknown[]): Promise<void> {}

    async linkToApp(..._args: unknown[]): Promise<void> {}

    async getSamplesForPipeline(..._args: unknown[]): Promise<any[]> {
        return [];
    }

    async copyConnectionsToProject(..._args: unknown[]): Promise<Map<string, string>> {
        return new Map();
    }
}
