/**
 * Renders a bar chart display for positive numeric values in table cells.
 */
import { Tooltip } from '@mantine/core';
import { type FC } from 'react';

type BarChartDisplayProps = {
    value: number;
    formatted: string;
    min: number;
    max: number;
    color?: string;
};

export const BarChartDisplay: FC<BarChartDisplayProps> = ({
    value,
    formatted,
    min,
    max,
    color = '#5470c6',
}) => {
    // Calculate bar width percentage
    const range = max - min;
    let percentage: number;

    if (range > 0) {
        // Normal case: calculate percentage based on range
        percentage = Math.max(0, Math.min(100, ((value - min) / range) * 100));
    } else {
        // Edge case: range is 0 (all values are the same)
        // Show 0% width to indicate no variation, matching test expectations
        percentage = 0;
    }

    // Calculate maximum bar width based on text length
    // This ensures longer formatted values (e.g., "$1,234,567.89") have more space
    // while shorter values (e.g., "5%") allow the bar to be more prominent
    //
    // Strategy:
    // - Estimate text width: ~7-8px per character (approximate for typical number fonts)
    // - Reserve minimum 50px for text (for short values like "5%")
    // - Reserve maximum 100px for text (for long values like "$1,234,567.89")
    // - Use a sliding scale: shorter text = more bar space, longer text = less bar space
    // - Ensure bar is always at least 50% visible for visual comparison
    const estimatedTextWidth = Math.min(
        Math.max(formatted.length * 7, 50), // Min 50px, scale with text length (~7px per char)
        100, // Max 100px to prevent bar from being too narrow
    );

    // Calculate max bar width as percentage
    // Assuming typical cell width range: 150-380px (average ~280px for bar columns)
    // Reserve space for text + gap, then calculate remaining percentage
    // Increased typical cell width for bar columns to ensure longer values like "65.55%" can display
    const typicalCellWidth = 280;
    const reservedSpace = estimatedTextWidth + 8; // text + gap
    const maxBarWidthPercent = Math.max(
        50, // Minimum 50% to ensure bar visibility for comparison
        Math.min(
            60, // Maximum 60% to ensure text visibility (reduced to give more space for longer text like "65.55%")
            ((typicalCellWidth - reservedSpace) / typicalCellWidth) * 100,
        ),
    );

    const barWidth = Math.min(percentage, maxBarWidthPercent);

    // Only show bar for positive numbers
    const showBar = value > 0;

    return (
        <div
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                width: '100%',
                maxWidth: '100%', // 确保容器不超出单元格宽度
                minWidth: 0, // 确保内容可以收缩
                boxSizing: 'border-box',
            }}
        >
            {showBar && (
                <div
                    style={{
                        width: `${barWidth}%`,
                        minWidth: '2px', // Always enforce minimum width for visibility
                        maxWidth: `${maxBarWidthPercent}%`,
                        height: '20px',
                        backgroundColor: color,
                        borderRadius: '2px',
                        flexShrink: 0,
                    }}
                />
            )}
            <Tooltip label={formatted} withinPortal position="top">
                <span
                    style={{
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        minWidth: 0, // Allow text to shrink when space is limited
                        cursor: 'help', // Show help cursor to indicate tooltip is available
                    }}
                >
                    {formatted}
                </span>
            </Tooltip>
        </div>
    );
};

// Keep the old function for backward compatibility, but it now returns a component
export const renderBarChartDisplay = (props: BarChartDisplayProps) => {
    return <BarChartDisplay {...props} />;
};
