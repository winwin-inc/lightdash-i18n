import { type CustomVis, type ResultRow } from '@lightdash/common';
import { useEffect, useMemo, useState } from 'react';
import { type InfiniteQueryResults } from './useQueryResults';

// 优化：使用更高效的数据转换方法，避免 Object.entries/fromEntries 的开销
const convertRowsToSeries = (rows: ResultRow[]) => {
    if (rows.length === 0) return [];

    // 预分配数组大小，避免动态扩容
    const result = new Array(rows.length);

    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const convertedRow: { [k: string]: unknown } = {};

        // 直接遍历对象属性，避免 Object.entries 的开销
        for (const key in row) {
            if (row.hasOwnProperty(key)) {
                convertedRow[key] = row[key].value.raw;
            }
        }

        result[i] = convertedRow;
    }

    return result;
};

export interface CustomVisualizationConfigAndData {
    validConfig: CustomVis;
    visSpec?: string;
    setVisSpec: (spec: string) => void;
    // TODO: do we need to type this better?
    series: {
        [k: string]: unknown;
    }[];
    fields?: string[];
}

const useCustomVisualizationConfig = (
    chartConfig: CustomVis | undefined,
    resultsData: InfiniteQueryResults | undefined,
): CustomVisualizationConfigAndData => {
    const [visSpec, setVisSpec] = useState<string | undefined>();
    const [visSpecObject, setVisSpecObject] = useState();

    // Set initial value
    useEffect(() => {
        try {
            if (chartConfig?.spec && !visSpec) {
                setVisSpec(JSON.stringify(chartConfig?.spec, null, 2));
            }
        } catch (e) {
            //TODO: handle error
        }
    }, [chartConfig?.spec, visSpec]);

    // Update object when spec changes
    useEffect(() => {
        try {
            if (visSpec) {
                setVisSpecObject(JSON.parse(visSpec));
            }
        } catch (e) {
            //TODO: handle error
        }
    }, [visSpec]);

    // 修复：使用更稳定的依赖，确保数据更新时能触发重新计算
    // 使用 rows 的长度和引用，确保多页数据加载时能正确更新
    const convertedRows = useMemo(() => {
        if (!resultsData?.rows) return [];
        return convertRowsToSeries(resultsData.rows);
    }, [resultsData?.rows?.length, resultsData?.rows]);

    const fields = useMemo(() => {
        return resultsData?.rows && resultsData.rows.length > 0
            ? Object.keys(resultsData.rows[0])
            : [];
    }, [resultsData?.rows?.length, resultsData?.rows]);

    // 修复：使用 useMemo 缓存返回对象，确保只有依赖变化时才返回新对象
    // 这样可以避免每次渲染都创建新对象，导致 CustomVisualization 不必要的重新渲染
    return useMemo(
        () => ({
            validConfig: { spec: visSpecObject },
            visSpec: visSpec,
            setVisSpec,
            series: convertedRows,
            fields,
        }),
        [visSpecObject, visSpec, setVisSpec, convertedRows, fields],
    );
};

export default useCustomVisualizationConfig;
