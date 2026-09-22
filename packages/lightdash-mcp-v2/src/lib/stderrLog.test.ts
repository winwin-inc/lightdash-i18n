import assert from 'node:assert/strict';
import { describe, it, beforeEach, afterEach } from 'node:test';
import {
    formatLocalTimestamp,
    getMcpLogLevel,
    resetMcpLogLevelCacheForTests,
    shouldLog,
} from './stderrLog';

describe('formatLocalTimestamp', () => {
    it('formats Asia/Shanghai with +08:00 regardless of process TZ', () => {
        const utc = new Date('2026-09-22T03:08:03.208Z');
        assert.equal(
            formatLocalTimestamp(utc),
            '[2026-09-22 11:08:03.208+08:00]',
        );
    });

    it('zero-pads fields and milliseconds', () => {
        const utc = new Date('2026-01-05T01:02:03.004Z');
        assert.equal(
            formatLocalTimestamp(utc),
            '[2026-01-05 09:02:03.004+08:00]',
        );
    });
});

describe('mcp log level', () => {
    const prev = process.env.LIGHTDASH_MCP_LOG_LEVEL;
    beforeEach(() => {
        resetMcpLogLevelCacheForTests();
    });
    afterEach(() => {
        if (prev === undefined) delete process.env.LIGHTDASH_MCP_LOG_LEVEL;
        else process.env.LIGHTDASH_MCP_LOG_LEVEL = prev;
        resetMcpLogLevelCacheForTests();
    });
    it('defaults to info', () => {
        delete process.env.LIGHTDASH_MCP_LOG_LEVEL;
        resetMcpLogLevelCacheForTests();
        assert.equal(getMcpLogLevel(), 'info');
        assert.equal(shouldLog('debug'), false);
    });
    it('debug enables verbose lines', () => {
        process.env.LIGHTDASH_MCP_LOG_LEVEL = 'debug';
        resetMcpLogLevelCacheForTests();
        assert.equal(shouldLog('debug'), true);
    });
    it('warn hides info', () => {
        process.env.LIGHTDASH_MCP_LOG_LEVEL = 'warn';
        resetMcpLogLevelCacheForTests();
        assert.equal(shouldLog('info'), false);
        assert.equal(shouldLog('warn'), true);
    });
});
