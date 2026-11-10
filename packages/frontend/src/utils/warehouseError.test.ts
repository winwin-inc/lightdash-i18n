import { describe, expect, it } from 'vitest';

import {
    getErrorMessageText,
    isWarehouseResourceLimitError,
} from './warehouseError';

const HOLOGRES_STYLE_ERROR = `internal error: hos_exception: [fragment_service.cc:360 ThrowException] HGERR_code 53200 HGERR_msge Total memory used by all existing queries exceeded memory limitation. HGERR_detl current total memory limit: 33441722368, current total memory usage: 34676408320`;

describe('warehouseError', () => {
    it('extracts the message from different error shapes', () => {
        expect(getErrorMessageText('boom')).toBe('boom');
        expect(getErrorMessageText(new Error('boom'))).toBe('boom');
        expect(
            getErrorMessageText({
                error: { name: 'UnexpectedServerError', message: 'boom' },
            }),
        ).toBe('boom');
        expect(getErrorMessageText(undefined)).toBe('');
    });

    it('detects warehouse resource limit errors', () => {
        expect(isWarehouseResourceLimitError(HOLOGRES_STYLE_ERROR)).toBe(true);
        expect(
            isWarehouseResourceLimitError({
                error: {
                    name: 'UnexpectedServerError',
                    statusCode: 500,
                    message: HOLOGRES_STYLE_ERROR,
                },
            }),
        ).toBe(true);
        expect(
            isWarehouseResourceLimitError(
                'query failed: Out of memory reached on host',
            ),
        ).toBe(true);
    });

    it('ignores unrelated errors', () => {
        expect(isWarehouseResourceLimitError('field not found')).toBe(false);
        expect(
            isWarehouseResourceLimitError(
                new Error('We are currently unable to reach the server'),
            ),
        ).toBe(false);
        expect(isWarehouseResourceLimitError(undefined)).toBe(false);
    });
});
