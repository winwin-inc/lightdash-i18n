/**
 * Renders a bar chart display for positive numeric values in table cells.
 */
import { type ReactElement } from 'react';

type BarChartDisplayProps = {
    value: number;
    formatted: string;
    min: number;
    max: number;
    color?: string;
};

export const renderBarChartDisplay = ({
    value,
    formatted,
    min,
    max,
    color = '#5470c6',
}: BarChartDisplayProps): ReactElement => {
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

    // Limit maximum bar width to 80% to ensure text is always visible
    // This prevents the bar from taking up the entire width and squeezing the text
    const maxBarWidth = 80;
    const barWidth = Math.min(percentage, maxBarWidth);

    // Only show bar for positive numbers
    const showBar = value > 0;

    return (
        <div
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                width: '100%',
            }}
        >
            {showBar && (
                <div
                    style={{
                        flexBasis: `${barWidth}%`,
                        width: `${barWidth}%`,
                        minWidth: '2px', // Always enforce minimum width for visibility
                        maxWidth: `${maxBarWidth}%`,
                        height: '20px',
                        backgroundColor: color,
                        borderRadius: '2px',
                        flexShrink: 0,
                    }}
                />
            )}
            <span style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>
                {formatted}
            </span>
        </div>
    );
};
