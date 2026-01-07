import { Knex } from 'knex';
import { UserTableName } from '../entities/users';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(UserTableName, (tableBuilder) => {
        tableBuilder.boolean('is_trial_account').defaultTo(false).notNullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(UserTableName, (tableBuilder) => {
        tableBuilder.dropColumn('is_trial_account');
    });
}

