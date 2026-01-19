/**
 * Renders a bar chart display for positive numeric values in table cells.
 * Text is overlaid on the bar to save space and ensure consistent bar widths.
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
    // Calculate bar width percentage based on value range
    // Use fixed max width to ensure consistent bar widths for same percentages
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

    // Use fixed max bar width (90%) to ensure consistency across all cells
    // Same percentage values will have the same bar width regardless of text length
    const maxBarWidthPercent = 90;
    const barWidth = Math.min(percentage, maxBarWidthPercent);

    // Only show bar for positive numbers
    const showBar = value > 0;

    // Estimate text width: approximately 7-8px per character for 12px font
    // Add padding (8px left + 8px right = 16px total) for text inside bar
    const estimatedTextWidthPx = formatted.length * 7 + 16;
    
    // Estimate minimum bar width needed to contain text
    // Assuming typical cell width ~200-300px, calculate minimum percentage needed
    // Use a conservative estimate: if bar width < 30% or text is too long, show text outside
    const minBarWidthForText = Math.max(30, (estimatedTextWidthPx / 250) * 100);
    
    // Determine text position and color based on bar width and text length
    // Show text inside bar only if bar is wide enough to contain the text comfortably
    const showTextOnBar = showBar && barWidth >= minBarWidthForText;
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
            {showBar && (
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
                            : showBar
                              ? `calc(${Math.max(barWidth, 2)}% + 8px)`
                              : '0',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        color: textColor,
                        fontSize: '12px',
                        fontWeight: showTextOnBar ? 500 : 400,
                        textShadow: showTextOnBar ? '0 1px 2px rgba(0, 0, 0, 0.3)' : 'none',
                        cursor: 'help',
                        // Use calc() for more accurate width calculation in absolute positioning
                        // When text is on bar, limit width to bar width minus padding (left 8px + right 8px)
                        // When text is after bar, use remaining space (100% - bar width - left margin 8px)
                        maxWidth: showTextOnBar
                            ? `calc(${barWidth}% - 16px)`
                            : showBar
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
};
