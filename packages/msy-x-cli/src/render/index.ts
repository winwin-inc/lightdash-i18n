import type { RenderInput, RenderOutput } from '../types';
import { pickRows } from './detect';
import { toCsv } from './csv';
import { renderJson } from './json';
import { renderTable } from './table';

/**
 * 渲染层唯一入口：按 format 分派（§7）。
 * - 'csv' 只允许数据类工具（校验由命令层负责，本层不阻止）；
 * - input.out !== null 时不写文件也不产出 stdout（写盘与摘要由 cli/output.ts 负责），
 *   仍返回 RenderOutput，rows 字段照常填行数供调用方组装摘要。
 */
export const renderResult = (input: RenderInput): RenderOutput => {
    const picked = pickRows(input.result);
    const rowCount = picked.rows !== null ? picked.rows.length : null;

    // --out：内容写盘由 cli/output.ts 负责，本层不落盘，stdout 置空
    if (input.out !== null) {
        return { stdout: '', rows: rowCount };
    }

    let stdout: string;
    if (input.format === 'table') {
        stdout = renderTable(picked.rows ?? []);
    } else if (input.format === 'csv') {
        stdout =
            picked.rows !== null && picked.columns !== null
                ? toCsv(picked.columns, picked.rows)
                : '';
    } else {
        stdout = renderJson({
            tool: input.tool,
            result: input.result,
            envelope: input.envelope,
            site: input.site,
            durationMs: Math.max(
                0,
                Math.round(performance.now() - input.startedAt),
            ),
            picked,
        });
    }

    return {
        stdout: stdout.endsWith('\n') ? stdout : `${stdout}\n`,
        rows: rowCount,
    };
};
