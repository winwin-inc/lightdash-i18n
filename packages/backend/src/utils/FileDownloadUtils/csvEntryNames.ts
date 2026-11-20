/**
 * 看板 CSV 导出的 zip 条目名。
 *
 * CSV 没有 sheet 概念，是一张图一个文件；多 Tab 看板里如果只用图表名，
 * 同名图（不同 Tab）会变成 `销售额.csv` / `销售额_2.csv`，看不出属于哪一页。
 * 因此：导出跨 >1 个 Tab 时给条目加 `<Tab名>__` 前缀；只导一页时保持图表名。
 */
export const getCsvZipEntryNames = (
    files: Array<{ filename: string; tabName?: string }>,
): string[] => {
    const tabNames = new Set(
        files
            .map((file) => file.tabName)
            .filter((tabName): tabName is string => !!tabName),
    );
    const useTabPrefix = tabNames.size > 1;

    return files.map((file) =>
        useTabPrefix && file.tabName
            ? `${file.tabName}__${file.filename}`
            : file.filename,
    );
};
