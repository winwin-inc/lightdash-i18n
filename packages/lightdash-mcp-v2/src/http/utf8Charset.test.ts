import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { withUtf8Charset } from './utf8Charset';

describe('withUtf8Charset', () => {
    it('adds charset to application/json', () => {
        assert.equal(
            withUtf8Charset('application/json'),
            'application/json; charset=utf-8',
        );
    });

    it('adds charset to text/event-stream', () => {
        assert.equal(
            withUtf8Charset('text/event-stream'),
            'text/event-stream; charset=utf-8',
        );
    });

    it('leaves existing charset alone', () => {
        assert.equal(
            withUtf8Charset('application/json; charset=utf-8'),
            'application/json; charset=utf-8',
        );
    });

    it('does not touch unrelated types', () => {
        assert.equal(withUtf8Charset('image/png'), 'image/png');
    });
});
