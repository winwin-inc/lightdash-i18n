import { NotFoundError } from '@lightdash/common';
import { Knex } from 'knex';
import {
    DbUserDashboardCategory,
    DbUserDashboardCategoryIn,
    UserDashboardCategoryTableName,
} from '../database/entities/userDashboardCategory';

type UserDashboardCategoryModelArguments = {
    database: Knex;
};

export class UserDashboardCategoryModel {
    private database: Knex;

    constructor(args: UserDashboardCategoryModelArguments) {
        this.database = args.database;
    }

    async find(filters: {
        dashboardUuid?: string;
        spaceUuid?: string;
        employeeId?: number;
        email?: string;
        categoryId?: string;
    }): Promise<DbUserDashboardCategory[]> {
        const query = this.database(UserDashboardCategoryTableName).select('*');

        if (filters.dashboardUuid) {
            void query.where('dashboard_uuid', filters.dashboardUuid);
        }
        if (filters.spaceUuid) {
            void query.where('space_uuid', filters.spaceUuid);
        }
        if (filters.employeeId) {
            void query.where('employee_id', filters.employeeId);
        }
        if (filters.email) {
            void query.where('email', filters.email);
        }
        if (filters.categoryId) {
            void query.where('category_id', filters.categoryId);
        }

        return query;
    }

    async get(id: string): Promise<DbUserDashboardCategory> {
        const [result] = await this.database(UserDashboardCategoryTableName)
            .where('id', id)
            .select('*');

        if (!result) {
            throw new NotFoundError(
                `UserDashboardCategory with id ${id} not found`,
            );
        }

        return result;
    }

    async create(
        data: DbUserDashboardCategoryIn,
    ): Promise<DbUserDashboardCategory> {
        const [result] = await this.database(UserDashboardCategoryTableName)
            .insert({
                ...data,
                create_time: new Date(),
            } as DbUserDashboardCategoryIn & { create_time: Date })
            .returning('*');

        return result;
    }

    async update(
        id: string,
        data: Partial<Omit<DbUserDashboardCategory, 'id' | 'create_time'>>,
    ): Promise<DbUserDashboardCategory> {
        const [result] = await this.database(UserDashboardCategoryTableName)
            .where('id', id)
            .update(data)
            .returning('*');

        if (!result) {
            throw new NotFoundError(
                `UserDashboardCategory with id ${id} not found`,
            );
        }

        return result;
    }

    async delete(id: string): Promise<void> {
        const deleted = await this.database(UserDashboardCategoryTableName)
            .where('id', id)
            .delete();

        if (deleted === 0) {
            throw new NotFoundError(
                `UserDashboardCategory with id ${id} not found`,
            );
        }
    }
}
