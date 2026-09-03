// STUB: full Knex-backed registry not ported — implements SandboxRegistryStore for compile
import { Knex } from 'knex';
import {
    type SandboxRegistryRecord,
    type SandboxRegistryStore,
} from '../services/SandboxRuntime/SandboxManager';
import {
    type PersistentWorkspace,
    type SnapshotRef,
} from '../services/SandboxRuntime/types';

export class SandboxRegistryModel implements SandboxRegistryStore {
    constructor(_args?: { database?: Knex }) {}

    async create(_input: {
        organizationUuid: string;
        projectUuid: string;
        provider: string;
        providerSandboxId: string;
        workspace: PersistentWorkspace;
    }): Promise<string> {
        return 'stub-sandbox-uuid';
    }

    async findBySandboxUuid(
        _sandboxUuid: string,
    ): Promise<SandboxRegistryRecord | null> {
        return null;
    }

    async markRunning(
        _sandboxUuid: string,
        _providerSandboxId: string,
    ): Promise<void> {}

    async markSuspended(
        _sandboxUuid: string,
        _input: { snapshotRef: SnapshotRef; providerSandboxId: string | null },
    ): Promise<void> {}

    async deleteBySandboxUuid(_sandboxUuid: string): Promise<void> {}

    async get(..._args: unknown[]): Promise<null> {
        return null;
    }

    async upsert(..._args: unknown[]): Promise<void> {}

    async delete(..._args: unknown[]): Promise<void> {}
}
