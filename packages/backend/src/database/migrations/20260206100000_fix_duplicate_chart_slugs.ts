import { Knex } from 'knex';

/**
 * 一次性数据修复：将同一项目内重复的 chart slug 改为唯一（保留每组最早一条，其余改为 slug-<短uuid>）。
 * 用于解决 Promote 409 "There are multiple charts with the same identifier <slug>"。
 * 执行：pnpm -F backend migrate
 * 若应用使用的数据库账号无 UPDATE 权限，需由 DBA 执行 docs/fix-duplicate-chart-slugs.sql 中的步骤 2。
 */
export async function up(knex: Knex): Promise<void> {
    await knex.raw(`
        WITH chart_project AS (
            SELECT
                sq.saved_query_uuid,
                sq.slug,
                COALESCE(
                    (SELECT p.project_uuid
                     FROM spaces s
                     JOIN projects p ON s.project_id = p.project_id
                     WHERE s.space_id = sq.space_id),
                    (SELECT p.project_uuid
                     FROM dashboards d
                     JOIN spaces s ON d.space_id = s.space_id
                     JOIN projects p ON s.project_id = p.project_id
                     WHERE d.dashboard_uuid = sq.dashboard_uuid)
                ) AS project_uuid,
                sq.created_at
            FROM saved_queries sq
            WHERE sq.slug IS NOT NULL
        ),
        ranked AS (
            SELECT
                saved_query_uuid,
                slug,
                project_uuid,
                ROW_NUMBER() OVER (
                    PARTITION BY project_uuid, slug
                    ORDER BY created_at, saved_query_uuid
                ) AS rn
            FROM chart_project
            WHERE project_uuid IS NOT NULL
        ),
        duplicate_rows AS (
            SELECT r.saved_query_uuid, r.slug, r.rn
            FROM ranked r
            JOIN (
                SELECT project_uuid, slug
                FROM ranked
                GROUP BY project_uuid, slug
                HAVING COUNT(*) > 1
            ) d ON d.project_uuid = r.project_uuid AND d.slug = r.slug
            WHERE r.rn > 1
        )
        UPDATE saved_queries sq
        SET slug = dr.slug || '-' || REPLACE(SUBSTRING(sq.saved_query_uuid::text FROM 1 FOR 8), '-', '')
        FROM duplicate_rows dr
        WHERE sq.saved_query_uuid = dr.saved_query_uuid
    `);
}

export async function down(knex: Knex): Promise<void> {
    // 无法可靠还原被修改的 slug，不提供 down
}
