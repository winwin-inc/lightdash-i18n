import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
    extractV1FieldValues,
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

describe('extractV1FieldValues', () => {
    it('extracts primitive values from results array', () => {
        assert.deepEqual(
            extractV1FieldValues({ results: ['A', 'B', 1, true] }),
            ['A', 'B', '1', 'true'],
        );
    });

    it('extracts object values from rows fallback shape', () => {
        assert.deepEqual(
            extractV1FieldValues({
                rows: [{ value: 'Zhejiang' }, { value: 10 }, { noop: 'x' }],
            }),
            ['Zhejiang', '10'],
        );
    });
});
