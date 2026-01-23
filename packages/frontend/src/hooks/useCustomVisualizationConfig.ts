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

    const rows = useMemo(() => resultsData?.rows, [resultsData]);

    const convertedRows = useMemo(() => {
        return rows ? convertRowsToSeries(rows) : [];
    }, [rows]);

    const fields = useMemo(() => {
        return rows && rows.length > 0 ? Object.keys(rows[0]) : [];
    }, [rows]);

    return {
        validConfig: { spec: visSpecObject },
        visSpec: visSpec,
        setVisSpec,
        series: convertedRows,
        fields,
    };
};

export default useCustomVisualizationConfig;
