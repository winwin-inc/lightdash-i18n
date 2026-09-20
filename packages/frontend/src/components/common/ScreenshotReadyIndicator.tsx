// STUB: screenshot constant not exported from common in this fork.
import { type FC } from 'react';

const SCREENSHOT_READY_INDICATOR_ID = 'lightdash-ready-indicator';

type ScreenshotReadyIndicatorProps = {
    tilesTotal: number;
    tilesReady: number;
    tilesErrored: number;
};

/**
 * Hidden DOM element that signals when an app/dashboard is ready for screenshot.
 */
const ScreenshotReadyIndicator: FC<ScreenshotReadyIndicatorProps> = ({
    tilesTotal,
    tilesReady,
    tilesErrored,
}) => {
    const status = tilesErrored > 0 ? 'completed-with-errors' : 'ready';

    return (
        <div
            id={SCREENSHOT_READY_INDICATOR_ID}
            data-status={status}
            data-tiles-total={tilesTotal}
            data-tiles-ready={tilesReady}
            data-tiles-errored={tilesErrored}
            style={{ display: 'none' }}
            aria-hidden="true"
        />
    );
};

export default ScreenshotReadyIndicator;
