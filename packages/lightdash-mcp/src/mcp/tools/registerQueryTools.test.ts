import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
    inferSqlDistinctField,
    isFieldValuesEndpointMissing,
} from './registerQueryTools';

describe('inferSqlDistinctField', () => {
    it('removes table prefix from fieldId', () => {
        assert.equal(
            inferSqlDistinctField('algo_branch_brand_v2', 'algo_branch_brand_v2_province'),
            'province',
        );
    });

    it('keeps original fieldId when prefix mismatches', () => {
        assert.equal(
            inferSqlDistinctField('orders', 'payments_amount'),
            'payments_amount',
        );
    });
});

describe('isFieldValuesEndpointMissing', () => {
    it('matches API endpoint not found 404', () => {
        assert.equal(
            isFieldValuesEndpointMissing(
                'Lightdash API 404: NotFoundError | 404 | API endpoint not found | {}',
            ),
            true,
        );
    });

    it('ignores non-404 errors', () => {
        assert.equal(
            isFieldValuesEndpointMissing(
                'Lightdash API 500: InternalServerError | 500 | boom',
            ),
            false,
        );
    });
});
