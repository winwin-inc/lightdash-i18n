import { useLightdash, useLightdashClient } from '@lightdash/query-sdk';

/**
 * Replace EXPLORE / METRIC with fields from your project, then `pnpm build`
 * and upload the folder from 浏览 → 全部数据应用.
 */
const EXPLORE = '';
const METRIC = '';

function Placeholder() {
    return (
        <section className="card">
            <h1>示例 KPI</h1>
            <p className="muted">
                编辑 <code>src/App.jsx</code> 中的 <code>EXPLORE</code> 与{' '}
                <code>METRIC</code>，保存后执行 <code>pnpm build</code>
                ，再到「全部数据应用」上传本目录。
            </p>
        </section>
    );
}

function LiveKpi({ explore, metric }) {
    const client = useLightdashClient();
    const { data, loading, error, format } = useLightdash(
        client.model(explore).metrics([metric]).limit(1),
    );

    if (loading) {
        return (
            <section className="card">
                <p className="muted">加载中…</p>
            </section>
        );
    }

    if (error) {
        return (
            <section className="card">
                <h1>查询失败</h1>
                <p className="error">{error.message}</p>
            </section>
        );
    }

    const row = data[0];
    const value = row ? format(row, metric) || String(row[metric] ?? '—') : '—';

    return (
        <section className="card">
            <p className="label">{metric}</p>
            <p className="value">{value}</p>
        </section>
    );
}

export default function App() {
    const explore = EXPLORE.trim();
    const metric = METRIC.trim();

    return (
        <main className="page">
            {explore && metric ? (
                <LiveKpi explore={explore} metric={metric} />
            ) : (
                <Placeholder />
            )}
        </main>
    );
}
