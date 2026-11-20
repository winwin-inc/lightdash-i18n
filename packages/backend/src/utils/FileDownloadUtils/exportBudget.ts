import {
    getDashboardExportRowLimitMessage,
    UnexpectedServerError,
} from '@lightdash/common';

/**
 * 看板一键导出的累计行数预算。
 *
 * 单张图有自己的上限（CSV 受 csvCellsLimit、XLSX 受 EXCEL_ROW_LIMIT），
 * 但一个看板十几张图叠加起来没有边界：/tmp 里要落合并后的 xlsx 和最终 zip，
 * 任务时长也按图线性增长。这里给一次导出一个总行数预算，超了就整体失败，
 * 让用户缩小范围（少选 Tab / 改选「表格结果」或自定义行数），
 * 而不是产出一个半截文件或跑到任务超时。
 */
export class ExportRowBudget {
    private usedRows = 0;

    constructor(private readonly maxRows: number) {}

    get used(): number {
        return this.usedRows;
    }

    get exceeded(): boolean {
        return this.usedRows > this.maxRows;
    }

    /** 记录一批已写入的行；累计超过上限时直接抛错中止整次导出 */
    add(rows: number): void {
        if (rows <= 0) return;
        this.usedRows += rows;
        if (this.exceeded) {
            throw new UnexpectedServerError(
                getDashboardExportRowLimitMessage({
                    rows: this.usedRows,
                    limit: this.maxRows,
                }),
            );
        }
    }

    /** 起跑下一张图前用：已经超预算就不要再打数仓 */
    assertWithinLimit(): void {
        if (this.exceeded) {
            throw new UnexpectedServerError(
                getDashboardExportRowLimitMessage({
                    rows: this.usedRows,
                    limit: this.maxRows,
                }),
            );
        }
    }
}
