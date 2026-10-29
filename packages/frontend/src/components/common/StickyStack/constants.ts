/**
 * Base z-index for the dashboard sticky layers (global filters, parameters,
 * tab bar and tab filters).
 *
 * It needs to be above the dashboard tile loading overlay
 * (`getDefaultZIndex('modal') - 10` = 190) so tiles never paint over the
 * sticky bar, but below the navbar (`NAVBAR_Z_INDEX`), Mantine's modal (200),
 * popover (300) and overlay (400) so dropdowns and dialogs still open on top
 * of it.
 */
export const STICKY_Z_INDEX_BASE = 195;
