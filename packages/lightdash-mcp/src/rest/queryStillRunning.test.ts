import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
    buildQueryStillRunningMessage,
    formatWaited,
    isQueryStillRunningError,
    QueryStillRunningError,
} from './queryStillRunning';

describe('formatWaited', () => {
    it('uses seconds below one minute', () => {
        assert.equal(formatWaited(59_000), '59 秒');
        assert.equal(formatWaited(500), '1 秒');
    });

    it('uses minutes from one minute up', () => {
        assert.equal(formatWaited(60_000), '1 分钟');
        assert.equal(formatWaited(180_000), '3 分钟');
    });
});

describe('QueryStillRunningError', () => {
    it('keeps the query uuid and states the query is still running', () => {
        const error = new QueryStillRunningError({
            queryUuid: 'q-1',
            waitedMs: 60_000,
            label: 'metric query',
        });

        assert.equal(error.name, 'QueryStillRunningError');
        assert.equal(error.queryUuid, 'q-1');
        assert.match(error.message, /仍在运行/);
        assert.match(error.message, /不是失败/);
        assert.match(error.message, /q-1/);
    });

    it('tells the caller not to resubmit the same query', () => {
        const message = buildQueryStillRunningMessage({
            queryUuid: 'q-2',
            waitedMs: 120_000,
            label: 'dashboard chart query',
        });

        // The whole point of this message: resubmitting doubles warehouse load.
        assert.match(message, /不要/);
        assert.match(message, /重复提交/);
        assert.match(message, /再起一条同样的查询/);
    });

    it('is recognisable so callers do not rewrite it into a "fix your query" hint', () => {
        const error = new QueryStillRunningError({
            queryUuid: 'q-3',
            waitedMs: 60_000,
            label: 'SQL query',
        });

        assert.equal(isQueryStillRunningError(error), true);
        assert.equal(
            isQueryStillRunningError(new Error('Query read timeout')),
            false,
        );
        assert.equal(isQueryStillRunningError(undefined), false);
    });
});
