import { getActiveTabForTabs } from './getActiveTabForTabs';

describe('getActiveTabForTabs', () => {
    const tabs = [
        { uuid: 'tab-1', name: 'Visible', order: 0, hidden: false },
        { uuid: 'tab-2', name: 'Hidden', order: 1, hidden: true },
    ];

    it('returns the URL tab in edit mode even when hidden', () => {
        expect(getActiveTabForTabs(tabs, 'tab-2', true, undefined)?.uuid).toBe(
            'tab-2',
        );
    });

    it('falls back to the first visible tab when URL points at a hidden tab', () => {
        expect(getActiveTabForTabs(tabs, 'tab-2', false, undefined)?.uuid).toBe(
            'tab-1',
        );
    });

    it('falls back to the lowest-order visible tab when the array is unsorted', () => {
        const unsortedTabs = [
            { uuid: 'tab-c', name: 'Third', order: 2, hidden: false },
            {
                uuid: 'tab-hidden',
                name: 'Hidden first',
                order: 0,
                hidden: true,
            },
            { uuid: 'tab-a', name: 'First', order: 1, hidden: false },
        ];

        expect(
            getActiveTabForTabs(unsortedTabs, undefined, false, undefined)
                ?.uuid,
        ).toBe('tab-a');
    });
});
