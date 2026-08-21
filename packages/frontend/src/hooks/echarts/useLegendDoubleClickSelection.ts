import { useCallback, useRef, useState } from 'react';

export type LegendClickEvent = {
    name: string;
    selected: Record<string, boolean>;
};

// ECharts 自身对同一次 click 会派发两次 legendselectchanged（间隔 0~2ms）。
// 这两次必须合并成一次；否则第二次会撞上双击窗口被误判。
const DUPLICATE_EVENT_THRESHOLD = 100;
// 真实双击的窗口（用户两次点击之间的间隔）
const DOUBLE_CLICK_DELAY = 300;

type LastClick = { name: string; time: number };

export const useLegendDoubleClickSelection = () => {
    const [selectedLegends, setSelectedLegends] = useState<
        Record<string, boolean>
    >({});
    const lastClickRef = useRef<LastClick | null>(null);

    const overrideSelectAllLegends = useCallback((params: LegendClickEvent) => {
        setSelectedLegends(
            Object.fromEntries(
                Object.keys(params.selected).map((key) => [key, true]),
            ),
        );
    }, []);

    const overrideSelectSingleLegend = useCallback(
        (params: LegendClickEvent) => {
            setSelectedLegends(
                Object.fromEntries(
                    Object.keys(params.selected).map((key) => [
                        key,
                        key === params.name,
                    ]),
                ),
            );
        },
        [],
    );

    const onLegendChange = useCallback(
        (params: LegendClickEvent) => {
            const now = Date.now();
            const last = lastClickRef.current;
            const sameName = last !== null && last.name === params.name;
            const sinceLast = sameName ? now - last.time : Infinity;

            // 1) ECharts 重复派发保护：极短间隔的同图例事件直接丢掉
            if (sameName && sinceLast < DUPLICATE_EVENT_THRESHOLD) {
                return;
            }

            // 2) 真实双击检测
            if (sameName && sinceLast <= DOUBLE_CLICK_DELAY) {
                if (
                    Object.entries(params.selected).every(([key, value]) => {
                        if (key !== params.name) {
                            return value === false;
                        }
                        return true;
                    })
                ) {
                    overrideSelectAllLegends(params);
                } else {
                    overrideSelectSingleLegend(params);
                }
                // 不把 lastClickRef 清掉，仅更新时间戳，
                // 这样同一 click 的 ECharts 第二次派发（1~2ms 后）
                // 还能命中上面的「重复事件」分支被丢弃，
                // 不会把 isolate 状态覆盖回 ECharts 默认 toggle。
                lastClickRef.current = { name: params.name, time: now };
                return;
            }

            // 3) 单击：直接同步 ECharts 当前的 toggle 状态
            lastClickRef.current = { name: params.name, time: now };
            setSelectedLegends(params.selected);
        },
        [overrideSelectAllLegends, overrideSelectSingleLegend],
    );

    return { selectedLegends, onLegendChange };
};
