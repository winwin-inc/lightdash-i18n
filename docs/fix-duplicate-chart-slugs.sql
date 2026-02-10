-- =============================================================================
-- 修复 Promote 409：同一项目内多条图表使用相同 slug（如 nm9uy、top）
-- =============================================================================
-- 使用场景：调用 /dashboards/:uuid/promoteDiff 报
--   "There are multiple charts with the same identifier <slug>"
-- 说明：上游项目里存在多条 saved_queries 使用同一 slug，需将重复项改为唯一 slug。
--
-- 若你没有表的修改权限，建议：
--   1) 用迁移执行（应用 DB 账号通常有写权限）：pnpm -F backend migrate
--      会执行 packages/backend/src/database/migrations/20260206100000_fix_duplicate_chart_slugs.ts
--   2) 若迁移账号也无写权限：将本文件中「步骤 1」结果给 DBA，由 DBA 执行「步骤 2」或本 SQL
--
-- 使用前请：
--   1. 先执行「步骤 1」查看当前重复项（示例已限定项目 3667f682-4080-44a4-8365-49f405936e09）
--   2. 备份或确认环境后再执行「步骤 2」进行更新（或通过迁移执行）
--
-- 注意：过滤时填的是 project_uuid（项目 UUID），不是 dashboard_uuid（看板 UUID）。
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 步骤 1：查看当前重复的 (project_uuid, slug) 及对应图表
-- -----------------------------------------------------------------------------
-- 示例：仅查项目 3667f682-4080-44a4-8365-49f405936e09；查全部项目时去掉 WHERE 中的 AND 条件即可

WITH
    chart_project AS (
        SELECT sq.saved_query_uuid, sq.slug, sq.name, sq.created_at, COALESCE(
                (
                    SELECT p.project_uuid
                    FROM spaces s
                        JOIN projects p ON s.project_id = p.project_id
                    WHERE
                        s.space_id = sq.space_id
                ), (
                    SELECT p.project_uuid
                    FROM
                        dashboards d
                        JOIN spaces s ON d.space_id = s.space_id
                        JOIN projects p ON s.project_id = p.project_id
                    WHERE
                        d.dashboard_uuid = sq.dashboard_uuid
                )
            ) AS project_uuid
        FROM saved_queries sq
        WHERE
            sq.slug IS NOT NULL
    ),
    dupes AS (
        SELECT project_uuid, slug, COUNT(*) AS cnt
        FROM chart_project
        WHERE
            project_uuid IS NOT NULL
        GROUP BY
            project_uuid,
            slug
        HAVING
            COUNT(*) > 1
    )
SELECT cp.project_uuid, cp.slug, cp.saved_query_uuid, cp.name, cp.created_at, d.cnt AS duplicate_count
FROM chart_project cp
    JOIN dupes d ON d.project_uuid = cp.project_uuid
    AND d.slug = cp.slug
WHERE
    cp.project_uuid = '3667f682-4080-44a4-8365-49f405936e09'
ORDER BY cp.project_uuid, cp.slug, cp.created_at;

-- -----------------------------------------------------------------------------
-- 步骤 2：修复重复 slug（保留每组第一条，其余改为 slug-<短 UUID>，保证唯一）
-- -----------------------------------------------------------------------------
-- 执行前请先运行步骤 1 确认影响范围。本更新仅修改重复组内「非第一条」的 slug。
-- 示例：仅修复项目 3667f682-4080-44a4-8365-49f405936e09；修全部项目时去掉 ranked 的 AND 即可。

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
    WHERE project_uuid = '3667f682-4080-44a4-8365-49f405936e09'
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
WHERE sq.saved_query_uuid = dr.saved_query_uuid;

-- -----------------------------------------------------------------------------
-- 可选：只修复指定 slug（例如仅修 nm9uy），且仅限项目 3667f682-4080-44a4-8365-49f405936e09
-- -----------------------------------------------------------------------------
-- 将 'nm9uy' 换成需要修复的 slug；将 project_uuid 换成目标项目或去掉 AND 修全库。

/*
WITH chart_project AS (
SELECT
sq.saved_query_uuid,
sq.slug,
COALESCE(
(SELECT p.project_uuid FROM spaces s JOIN projects p ON s.project_id = p.project_id WHERE s.space_id = sq.space_id),
(SELECT p.project_uuid FROM dashboards d JOIN spaces s ON d.space_id = s.space_id JOIN projects p ON s.project_id = p.project_id WHERE d.dashboard_uuid = sq.dashboard_uuid)
) AS project_uuid,
sq.created_at
FROM saved_queries sq
WHERE sq.slug = 'nm9uy'
AND COALESCE(
(SELECT p.project_uuid FROM spaces s JOIN projects p ON s.project_id = p.project_id WHERE s.space_id = sq.space_id),
(SELECT p.project_uuid FROM dashboards d JOIN spaces s ON d.space_id = s.space_id JOIN projects p ON s.project_id = p.project_id WHERE d.dashboard_uuid = sq.dashboard_uuid)
) = '3667f682-4080-44a4-8365-49f405936e09'
),
ranked AS (
SELECT saved_query_uuid, slug,
ROW_NUMBER() OVER (PARTITION BY project_uuid, slug ORDER BY created_at, saved_query_uuid) AS rn
FROM chart_project
WHERE project_uuid IS NOT NULL
)
UPDATE saved_queries sq
SET slug = r.slug || '-' || REPLACE(SUBSTRING(sq.saved_query_uuid::text FROM 1 FOR 8), '-', '')
FROM ranked r
WHERE sq.saved_query_uuid = r.saved_query_uuid AND r.rn > 1;
*/