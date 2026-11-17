import assert from 'node:assert/strict';
import test from 'node:test';
import {
    debugLog,
    logError,
    logInfo,
    logWarn,
    setQuiet,
    setVerbose,
    verboseLog,
} from './logger';

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

/** 计数 stdout 写入（verbose 只准写 stderr，stdout 必须不变） */
const countStdoutWrites = (): { count: () => number; restore: () => void } => {
    const original = process.stdout.write.bind(process.stdout);
    let writes = 0;
    const write = ((): boolean => {
        writes += 1;
        return true;
    }) as typeof process.stdout.write;
    process.stdout.write = write;
    return {
        count: () => writes,
        restore: () => {
            process.stdout.write = original;
        },
    };
};

/** MSY_X_DEBUG 环境变量快照/还原（verbose 用例频繁切换） */
const envDebug = {
    backup: (): string | undefined => process.env.MSY_X_DEBUG,
    restore: (previous: string | undefined): void => {
        if (previous === undefined) {
            delete process.env.MSY_X_DEBUG;
        } else {
            process.env.MSY_X_DEBUG = previous;
        }
    },
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

/* ------------------------------------------------------------------ */
/* D10：verboseLog（--verbose / MSY_X_DEBUG=1，不受 --quiet 影响）      */
/* ------------------------------------------------------------------ */

test('verboseLog：默认（未开启、无 MSY_X_DEBUG）不输出', () => {
    const previous = envDebug.backup();
    const capture = captureStderr();
    try {
        delete process.env.MSY_X_DEBUG;
        setVerbose(false);
        verboseLog('hidden', { rows: 1 });
        assert.equal(capture.lines.length, 0);
    } finally {
        capture.restore();
        setVerbose(false);
        envDebug.restore(previous);
    }
});

test('verboseLog：setVerbose(true) 输出到 stderr，带 [verbose] 前缀', () => {
    const previous = envDebug.backup();
    const capture = captureStderr();
    try {
        delete process.env.MSY_X_DEBUG;
        setVerbose(true);
        verboseLog('hello', { rows: 2 });
        assert.equal(capture.lines.length, 1);
        assert.match(capture.lines[0], /^\[verbose\] hello \{"rows":2\}\n$/);
    } finally {
        capture.restore();
        setVerbose(false);
        envDebug.restore(previous);
    }
});

test('verboseLog：MSY_X_DEBUG=1 等价开启（无需 setVerbose）', () => {
    const previous = envDebug.backup();
    const capture = captureStderr();
    try {
        process.env.MSY_X_DEBUG = '1';
        setVerbose(false);
        verboseLog('via env');
        assert.equal(capture.lines.length, 1);
        assert.match(capture.lines[0], /^\[verbose\] via env\n$/);
    } finally {
        capture.restore();
        setVerbose(false);
        envDebug.restore(previous);
    }
});

test('verboseLog：--quiet 不影响（照常输出）', () => {
    const previous = envDebug.backup();
    const capture = captureStderr();
    try {
        delete process.env.MSY_X_DEBUG;
        setQuiet(true);
        setVerbose(true);
        verboseLog('quiet but verbose');
        assert.equal(capture.lines.length, 1);
        assert.match(capture.lines[0], /^\[verbose\] quiet but verbose\n$/);
    } finally {
        capture.restore();
        setQuiet(false);
        setVerbose(false);
        envDebug.restore(previous);
    }
});

test('verboseLog：脱敏（含嵌套）且 stdout 零写入', () => {
    const previous = envDebug.backup();
    const pat = `ldpat_${'a'.repeat(38)}`;
    const capture = captureStderr();
    const stdout = countStdoutWrites();
    try {
        delete process.env.MSY_X_DEBUG;
        setVerbose(true);
        verboseLog('call args', {
            apiKey: pat,
            Authorization: 'ApiKey x',
            nested: { token: 't', keep: 1 },
        });
        assert.equal(capture.lines.length, 1);
        const line = capture.lines[0];
        assert.ok(!line.includes(pat), 'PAT 绝不能出现在日志里');
        assert.ok(!line.includes('ApiKey x'), 'Authorization 值必须脱敏');
        assert.match(
            line,
            /\[verbose\] call args \{"apiKey":"\*\*\*","Authorization":"\*\*\*","nested":\{"token":"\*\*\*","keep":1\}\}/,
        );
        assert.equal(stdout.count(), 0, 'verbose 只准写 stderr');
    } finally {
        capture.restore();
        stdout.restore();
        setVerbose(false);
        envDebug.restore(previous);
    }
});
