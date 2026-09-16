import assert from 'node:assert/strict';
import { describe, it, beforeEach, afterEach } from 'node:test';
import {
    formatLocalTimestamp,
    getMcpLogLevel,
    resetMcpLogLevelCacheForTests,
    shouldLog,
} from './stderrLog';

describe('formatLocalTimestamp', () => {
    it('includes date and time with milliseconds in brackets', () => {
        const s = formatLocalTimestamp(new Date(2026, 2, 14, 20, 12, 34, 789));
        assert.match(s, /^\[2026-03-14 20:12:34\.789\]$/);
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
