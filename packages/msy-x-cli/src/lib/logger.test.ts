import assert from 'node:assert/strict';
import test from 'node:test';
import { debugLog, logError, logInfo, logWarn, setQuiet } from './logger';

type Capture = {
    lines: string[];
    restore: () => void;
};

const captureStderr = (): Capture => {
    const original = process.stderr.write.bind(process.stderr);
    const lines: string[] = [];
    const write = ((chunk: Uint8Array | string): boolean => {
        lines.push(Buffer.isBuffer(chunk) ? chunk.toString() : String(chunk));
        return true;
    }) as typeof process.stderr.write;
    process.stderr.write = write;
    return {
        lines,
        restore: () => {
            process.stderr.write = original;
        },
    };
};

test('logInfo 写 stderr 且带 [info] 前缀', () => {
    const capture = captureStderr();
    try {
        setQuiet(false);
        logInfo('hello', { rows: 2 });
        assert.equal(capture.lines.length, 1);
        assert.match(capture.lines[0], /^\[info\] hello \{"rows":2\}\n$/);
    } finally {
        capture.restore();
        setQuiet(false);
    }
});

test('静默模式关闭 info，但保留 warn / error', () => {
    const capture = captureStderr();
    try {
        setQuiet(true);
        logInfo('should be silent');
        logWarn('visible warn');
        logError('visible error');
        assert.equal(capture.lines.length, 2);
        assert.match(capture.lines[0], /^\[warn\] visible warn\n$/);
        assert.match(capture.lines[1], /^\[error\] visible error\n$/);
    } finally {
        capture.restore();
        setQuiet(false);
    }
});

test('debugLog 仅在 MSY_X_DEBUG=1 时输出', () => {
    const previous = process.env.MSY_X_DEBUG;
    const capture = captureStderr();
    try {
        delete process.env.MSY_X_DEBUG;
        debugLog('hidden');
        process.env.MSY_X_DEBUG = '1';
        debugLog('shown', { ok: true });
        assert.equal(capture.lines.length, 1);
        assert.match(capture.lines[0], /^\[debug\] shown \{"ok":true\}\n$/);
    } finally {
        capture.restore();
        if (previous === undefined) {
            delete process.env.MSY_X_DEBUG;
        } else {
            process.env.MSY_X_DEBUG = previous;
        }
    }
});

test('所有输出过 redact：消息与 data 中的令牌都被屏蔽', () => {
    const pat = `ldpat_${'a'.repeat(38)}`;
    const capture = captureStderr();
    try {
        setQuiet(false);
        logInfo(`带令牌的消息 ${pat}`, { pat, keep: 1 });
        const line = capture.lines.join('');
        assert.ok(!line.includes(pat), 'PAT 绝不能出现在日志里');
        assert.match(line, /\[info\] 带令牌的消息 \*\*\* \{"pat":"\*\*\*","keep":1\}/);
    } finally {
        capture.restore();
        setQuiet(false);
    }
});
