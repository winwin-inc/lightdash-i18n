/**
 * Renders a bar chart display for positive numeric values in table cells.
 * Text is overlaid on the bar to save space and ensure consistent bar widths.
 * 懒加载：首帧只展示文字，下一帧再渲染条形，减轻表格滚动时主线程压力。
 */
import { Tooltip } from '@mantine/core';
import { memo, useEffect, useState, type FC } from 'react';

type BarChartDisplayProps = {
    value: number;
    formatted: string;
    min: number;
    max: number;
    color?: string;
};

export const BarChartDisplay: FC<BarChartDisplayProps> = memo(({
    value,
    formatted,
    min,
    max,
    color = '#5470c6',
}) => {
    const [showBar, setShowBar] = useState(false);
    useEffect(() => {
        const rafId = requestAnimationFrame(() => setShowBar(true));
        return () => cancelAnimationFrame(rafId);
    }, []);

    const range = max - min;
    let percentage: number;
    if (range > 0) {
        percentage = Math.max(0, Math.min(100, ((value - min) / range) * 100));
    } else {
        percentage = 0;
    }
    const maxBarWidthPercent = 90;
    const barWidth = Math.min(percentage, maxBarWidthPercent);
    const showBarElement = value > 0 && showBar;

    const estimatedTextWidthPx = formatted.length * 7 + 16;
    const minBarWidthForText = Math.max(30, (estimatedTextWidthPx / 250) * 100);
    const showTextOnBar = showBarElement && barWidth >= minBarWidthForText;
    const textColor = showTextOnBar ? '#ffffff' : 'inherit';

    return (
        <div
            style={{
                position: 'relative',
                width: '100%',
                maxWidth: '100%',
                minWidth: 0,
                boxSizing: 'border-box',
                height: '20px',
                display: 'flex',
                alignItems: 'center',
            }}
        >
            {showBarElement && (
                <div
                    style={{
                        width: `${barWidth}%`,
                        minWidth: '2px',
                        height: '20px',
                        backgroundColor: color,
                        borderRadius: '2px',
                        position: 'absolute',
                        left: 0,
                        top: 0,
                    }}
                />
            )}
            <Tooltip label={formatted} withinPortal position="top">
                <span
                    style={{
                        position: 'absolute',
                        left: showTextOnBar
                            ? '8px'
                            : showBarElement
                            ? `calc(${Math.max(barWidth, 2)}% + 8px)`
                            : '0',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        whiteSpace: 'nowrap',
                        color: textColor,
                        fontSize: '12px',
                        fontWeight: showTextOnBar ? 500 : 400,
                        textShadow: showTextOnBar
                            ? '0 1px 2px rgba(0, 0, 0, 0.3)'
                            : 'none',
                        cursor: 'help',
                        maxWidth: showTextOnBar
                            ? `calc(${barWidth}% - 16px)`
                            : showBarElement
                            ? `calc((100% - ${Math.max(barWidth, 2)}%) - 8px)`
                            : '100%',
                        zIndex: 1,
                    }}
                >
                    {formatted}
                </span>
            </Tooltip>
        </div>
    );
});
BarChartDisplay.displayName = 'BarChartDisplay';
