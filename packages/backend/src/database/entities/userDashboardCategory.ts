import { Knex } from 'knex';

export const UserDashboardCategoryTableName = 'user_dashboard_category';

export type DbUserDashboardCategory = {
    id: string;
    dashboard_id: number;
    employee_id: number;
    dashboard_uuid: string;
    space_uuid: string;
    short_name: string;
    email: string;
    category_id: string;
    category: string;
    create_time: Date;
};

export type DbUserDashboardCategoryIn = Pick<
    DbUserDashboardCategory,
    | 'dashboard_id'
    | 'employee_id'
    | 'dashboard_uuid'
    | 'space_uuid'
    | 'short_name'
    | 'email'
    | 'category_id'
    | 'category'
>;

export type UserDashboardCategoryTable = Knex.CompositeTableType<
    DbUserDashboardCategory,
    DbUserDashboardCategoryIn,
    Partial<Omit<DbUserDashboardCategory, 'id' | 'create_time'>>
>;
