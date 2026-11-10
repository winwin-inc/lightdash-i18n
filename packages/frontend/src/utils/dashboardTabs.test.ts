import {
    resolveEffectiveTabUuid,
    shouldQueryTileForTab,
} from './dashboardTabs';

describe('resolveEffectiveTabUuid', () => {
    const tabs = [{ uuid: 'tab-1' }, { uuid: 'tab-2' }];

    it('returns undefined when the dashboard has no tabs', () => {
        expect(resolveEffectiveTabUuid(undefined, [])).toBeUndefined();
    });

    it('keeps the tile tab while the tab list is not loaded yet', () => {
        // 首屏：Tab 列表还没拿到，但 tile 带 tabUuid 就不能当成「无 Tab 看板」
        expect(resolveEffectiveTabUuid('tab-2', [])).toBe('tab-2');
    });

    it('returns the tile tab when it exists', () => {
        expect(resolveEffectiveTabUuid('tab-2', tabs)).toBe('tab-2');
    });

    it('falls back to the first tab when the tile tab is unknown', () => {
        expect(resolveEffectiveTabUuid('deleted-tab', tabs)).toBe('tab-1');
        expect(resolveEffectiveTabUuid(undefined, tabs)).toBe('tab-1');
    });
});

describe('shouldQueryTileForTab', () => {
    it('allows queries when there is no tab scope', () => {
        expect(shouldQueryTileForTab(undefined, new Set())).toBe(true);
    });

    it('allows queries for visited tabs only', () => {
        const visited = new Set(['tab-1']);
        expect(shouldQueryTileForTab('tab-1', visited)).toBe(true);
        expect(shouldQueryTileForTab('tab-2', visited)).toBe(false);
    });

    it('allows queries when visited tabs are unknown', () => {
        expect(shouldQueryTileForTab('tab-2', undefined)).toBe(true);
    });
});
