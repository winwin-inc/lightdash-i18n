import assert from 'node:assert/strict';
import test from 'node:test';
import { redact, REDACTED } from './redact';

const makePat = (char = 'a'): string => `ldpat_${char.repeat(38)}`;

test('字符串中的 ldpat_ 令牌被屏蔽', () => {
    const pat = makePat();
    assert.equal(redact(`Bearer ${pat}`), 'Bearer ***');
    assert.equal(
        redact(`头 ${makePat('x')} 尾 ${makePat('9')}`),
        '头 *** 尾 ***',
    );
});

test('短于 38 位的疑似令牌不误伤', () => {
    assert.equal(redact('ldpat_short'), 'ldpat_short');
    assert.equal(redact(`ldpat_${'a'.repeat(37)}`), `ldpat_${'a'.repeat(37)}`);
});

test('键名含 token/secret/pat/authorization 的值整体屏蔽', () => {
    const output = redact({
        accessToken: 'at',
        clientSecret: 'cs',
        pat: 'p',
        authorization: 'ApiKey x',
        keep: 'v',
        nested: { refreshToken: 'rt', name: 'x' },
    }) as Record<string, unknown>;
    assert.deepEqual(output, {
        accessToken: REDACTED,
        clientSecret: REDACTED,
        pat: REDACTED,
        authorization: REDACTED,
        keep: 'v',
        nested: { refreshToken: REDACTED, name: 'x' },
    });
});

test('原始值、null、数组原样处理', () => {
    assert.equal(redact(42), 42);
    assert.equal(redact(null), null);
    assert.equal(redact(true), true);
    assert.deepEqual(redact([makePat(), 'b']), [REDACTED, 'b']);
    assert.deepEqual(redact({ list: [makePat()] }), { list: [REDACTED] });
});

test('深拷贝语义：不修改入参，返回新对象', () => {
    const input = {
        pat: 'p',
        msg: `包含 ${makePat()}`,
        nested: { accessToken: 'a', keep: [1, 2] },
    };
    const snapshot = JSON.parse(JSON.stringify(input));
    const output = redact(input) as Record<string, unknown>;

    assert.deepEqual(input, snapshot, '入参不能被修改');
    assert.notEqual(output, input);
    assert.notEqual(output.nested, input.nested);
    assert.equal((output.nested as Record<string, unknown>).accessToken, REDACTED);
    assert.equal(output.msg, '包含 ***');
    assert.deepEqual(input.nested, snapshot.nested);
});

test('敏感键嵌套在数组内也会被屏蔽', () => {
    const output = redact({
        auth: [{ mode: 'pat', pat: makePat() }],
    }) as Record<string, unknown>;
    assert.deepEqual(output, { auth: [{ mode: 'pat', pat: REDACTED }] });
});
