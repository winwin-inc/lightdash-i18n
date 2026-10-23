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

        const [sql, bindings] = raw.mock.calls[0];
        expect(sql).toContain('target.project_id = ancestor.project_id');
        expect(sql).toContain('target.path <@ ancestor.path');
        expect(bindings).toEqual([['space-child']]);
    });
});
