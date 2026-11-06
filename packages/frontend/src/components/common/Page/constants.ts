import { type MantineSize } from '@mantine/core';
import { STICKY_Z_INDEX_BASE } from '../StickyStack/constants';

export const PAGE_HEADER_HEIGHT = 64;

export const NAVBAR_HEIGHT = 50;
export const BANNER_HEIGHT = 35;

/**
 * Z-index of the fixed navbar (and of the preview banner above it).
 *
 * It must be above the dashboard sticky layers (`STICKY_Z_INDEX_BASE`),
 * otherwise the dropdowns opened from the navbar (e.g. the project switcher)
 * are painted over by the sticky filter/tab bar, because they are rendered
 * inside the navbar stacking context.
 *
 * It stays below Mantine's modal (200) so dialogs are still shown on top of
 * the navbar.
 */
export const NAVBAR_Z_INDEX = STICKY_Z_INDEX_BASE + 1;

export const FOOTER_HEIGHT = 80;
export const FOOTER_MARGIN: MantineSize = 'lg';

export const PAGE_CONTENT_WIDTH = 900;
export const PAGE_CONTENT_MAX_WIDTH_LARGE = 1600;
export const PAGE_MIN_CONTENT_WIDTH = 600;

export const SIDEBAR_DEFAULT_WIDTH = 400;
export const SIDEBAR_MIN_WIDTH = 320;

export const SIDEBAR_RESIZE_HANDLE_WIDTH = 6;
