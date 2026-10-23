import { SpaceModel } from './SpaceModel';

describe('SpaceModel space ancestors', () => {
    const raw = jest.fn();

    const model = () => new SpaceModel({ database: { raw } as never });

    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('returns the given spaces and their ancestors', async () => {
        raw.mockResolvedValueOnce({
            rows: [{ space_uuid: 'space-root' }, { space_uuid: 'space-child' }],
        });

        const result = await model().getSpaceUuidsWithAncestors([
            'space-child',
        ]);

        expect(result).toEqual(new Set(['space-root', 'space-child']));
    });

    test('does not query when there is no space', async () => {
        const result = await model().getSpaceUuidsWithAncestors([]);

        expect(result.size).toBe(0);
        expect(raw).not.toHaveBeenCalled();
    });

    test('scopes the ancestor join to the project', async () => {
        raw.mockResolvedValueOnce({ rows: [] });

        await model().getSpaceUuidsWithAncestors(['space-child']);

        const [sql] = raw.mock.calls[0];
        expect(sql).toContain('target.project_id = ancestor.project_id');
        expect(sql).toContain('target.path <@ ancestor.path');
    });

    test('binds the space uuids as individual parameters', async () => {
        raw.mockResolvedValueOnce({ rows: [] });

        await model().getSpaceUuidsWithAncestors([
            'space-child',
            'space-other',
        ]);

        const [sql, bindings] = raw.mock.calls[0];
        // One placeholder per uuid: an array binding would be sent as a single
        // postgres array parameter and fail on uuid columns.
        expect(sql).toContain('IN (?, ?)');
        expect(bindings).toEqual(['space-child', 'space-other']);
    });
});

describe('SpaceModel visible chart counts', () => {
    const raw = jest.fn();

    const model = () => new SpaceModel({ database: { raw } as never });

    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('counts the visible charts per space', async () => {
        raw.mockResolvedValueOnce({
            rows: [
                { space_uuid: 'space-a', chart_count: '2' },
                { space_uuid: 'space-b', chart_count: '1' },
            ],
        });

        const counts = await model().getVisibleChartCountsBySpaceUuids(
            ['space-a', 'space-b', 'space-c'],
            ['chart-1', 'chart-2'],
        );

        expect(counts.get('space-a')).toBe(2);
        expect(counts.get('space-b')).toBe(1);
        // Spaces without visible charts keep a zero count
        expect(counts.get('space-c')).toBe(0);
    });

    test('does not query when there is no visible chart', async () => {
        const counts = await model().getVisibleChartCountsBySpaceUuids(
            ['space-a'],
            [],
        );

        expect(counts.get('space-a')).toBe(0);
        expect(raw).not.toHaveBeenCalled();
    });

    test('binds the uuids as individual parameters', async () => {
        raw.mockResolvedValueOnce({ rows: [] });

        await model().getVisibleChartCountsBySpaceUuids(
            ['space-a', 'space-b'],
            ['chart-1'],
        );

        const [sql, bindings] = raw.mock.calls[0];
        expect(sql).toContain('IN (?, ?)');
        expect(sql).toContain('IN (?)');
        // Flat list of scalar bindings, never nested arrays
        expect(bindings).toEqual([
            'space-a',
            'space-b',
            'chart-1',
            'space-a',
            'space-b',
            'chart-1',
        ]);
    });
});
