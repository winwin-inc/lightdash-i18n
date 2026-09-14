import { Knex } from 'knex';

const ScopedRolesTableName = 'scoped_roles';
const CUSTOM_SQL_SCOPE = 'manage:CustomSql';
const CUSTOM_SQL_TC_SCOPE = 'manage:CustomSqlTableCalculations';

/**
 * Backfill manage:CustomSqlTableCalculations into custom roles that already
 * have manage:CustomSql, so existing SQL-author roles keep SQL table calc
 * authoring after the new gate is enforced.
 */
export async function up(knex: Knex): Promise<void> {
    try {
        const hasTable = await knex.schema.hasTable(ScopedRolesTableName);
        if (!hasTable) {
            return;
        }
        await knex.raw(
            `
            INSERT INTO ?? (role_uuid, scope_name, granted_by)
            SELECT role_uuid, ?, granted_by
            FROM ??
            WHERE scope_name = ?
            ON CONFLICT DO NOTHING
            `,
            [
                ScopedRolesTableName,
                CUSTOM_SQL_TC_SCOPE,
                ScopedRolesTableName,
                CUSTOM_SQL_SCOPE,
            ],
        );
    } catch (error) {
        // eslint-disable-next-line no-console
        console.error(
            `[migration 20260908170000] Failed to backfill ${CUSTOM_SQL_TC_SCOPE}. Grant manually if needed.`,
            error,
        );
    }
}

export async function down(knex: Knex): Promise<void> {
    try {
        const hasTable = await knex.schema.hasTable(ScopedRolesTableName);
        if (!hasTable) {
            return;
        }
        await knex(ScopedRolesTableName)
            .where('scope_name', CUSTOM_SQL_TC_SCOPE)
            .delete();
    } catch (error) {
        // eslint-disable-next-line no-console
        console.error(
            `[migration 20260908170000] Failed to remove ${CUSTOM_SQL_TC_SCOPE} on rollback.`,
            error,
        );
    }
}
