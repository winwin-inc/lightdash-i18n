import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { CLI_VERSION } from './version';

test('CLI_VERSION 与 package.json 一致', () => {
    const pkg = JSON.parse(
        readFileSync(
            path.join(__dirname, '..', '..', 'package.json'),
            'utf8',
        ),
    ) as { version: string };
    assert.equal(CLI_VERSION, pkg.version);
});
