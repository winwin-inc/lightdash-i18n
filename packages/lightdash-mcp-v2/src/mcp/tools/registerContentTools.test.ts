import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getContentSlimMapper } from './registerContentTools';
import {
    slimChartSearchItem,
    slimContentItem,
    slimDashboardSearchItem,
} from '../../lib/toolOutput';

describe('getContentSlimMapper', () => {
    it('returns chart slim mapper for chart search', () => {
        assert.equal(getContentSlimMapper(['chart']), slimChartSearchItem);
    });

    it('returns dashboard slim mapper for dashboard search', () => {
        assert.equal(
            getContentSlimMapper(['dashboard']),
            slimDashboardSearchItem,
        );
    });

    it('returns default slim mapper for mixed or unknown type', () => {
        assert.equal(getContentSlimMapper(undefined), slimContentItem);
        assert.equal(getContentSlimMapper(['space']), slimContentItem);
    });
});
