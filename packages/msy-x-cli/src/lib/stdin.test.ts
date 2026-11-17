import assert from 'node:assert/strict';
import test from 'node:test';
import { PassThrough } from 'node:stream';
import { readStdinIfPiped } from './stdin';

const asReadStream = (stream: PassThrough): NodeJS.ReadStream =>
    stream as unknown as NodeJS.ReadStream;

test('TTY 下直接返回 null（注入参数）', { timeout: 2000 }, async () => {
    const fake = new PassThrough();
    Object.defineProperty(fake, 'isTTY', { value: true });
    assert.equal(await readStdinIfPiped(asReadStream(fake)), null);
});

test('TTY 下直接返回 null（手工 stub process.stdin，默认参数）', { timeout: 2000 }, async () => {
    const original = process.stdin;
    const fake = new PassThrough();
    Object.defineProperty(fake, 'isTTY', { value: true });
    Object.defineProperty(process, 'stdin', {
        value: fake,
        configurable: true,
    });
    try {
        assert.equal(await readStdinIfPiped(), null);
    } finally {
        Object.defineProperty(process, 'stdin', {
            value: original,
            configurable: true,
        });
    }
});

test('管道输入读到 end 为止', { timeout: 2000 }, async () => {
    const fake = new PassThrough();
    const promise = readStdinIfPiped(asReadStream(fake));
    fake.write('{"a":');
    fake.write('1}');
    fake.end();
    assert.equal(await promise, '{"a":1}');
});

test('空管道返回空字符串', { timeout: 2000 }, async () => {
    const fake = new PassThrough();
    const promise = readStdinIfPiped(asReadStream(fake));
    fake.end();
    assert.equal(await promise, '');
});

test('读取出错返回 null', { timeout: 2000 }, async () => {
    const fake = new PassThrough();
    const promise = readStdinIfPiped(asReadStream(fake));
    fake.destroy(new Error('boom'));
    assert.equal(await promise, null);
});
