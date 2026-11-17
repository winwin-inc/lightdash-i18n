import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import yaml from 'js-yaml';
import { CliError } from '../cli/errors';
import { ExitCode } from '../cli/exitCodes';
import type { OAuthCredentials } from '../types';
import {
    ensureConfigDir,
    ensureFileMode,
    getConfigDir,
    getConfigFilePath,
    type EnvVars,
} from './paths';
import {
    defaultConfig,
    getConfigPathForDisplay,
    readConfig,
    writeConfig,
} from './store';

const isPosix = process.platform !== 'win32';

/** 每个用例独立的临时配置环境（os.tmpdir + mkdtemp，绝不碰真实 ~/.config） */
const makeTempEnv = async (): Promise<{
    env: EnvVars;
    dir: string;
    file: string;
}> => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'msy-x-config-'));
    const file = path.join(dir, 'config.yaml');
    return { env: { MSY_X_CONFIG: file }, dir, file };
};

const getMode = async (target: string): Promise<number> =>
    // eslint-disable-next-line no-bitwise
    (await stat(target)).mode & 0o777;

test('文件不存在时返回内置默认配置（设计稿 §4.2）', async () => {
    const { env } = await makeTempEnv();
    const config = await readConfig(env);
    assert.equal(config.currentSite, 'x');
    assert.equal(config.sites.x!.mcpUrl, 'https://x.brandct.com/api/v1/mcp');
    assert.equal(config.sites.x!.authMode, 'oauth');
    assert.equal(config.sites.x!.authHeader, 'authorization');
    assert.equal(
        config.sites.inner!.mcpUrl,
        'https://lightdash.banmahui.cn/api/v1/mcp',
    );
    assert.equal(config.sites.inner!.authMode, 'pat');
    assert.equal(config.sites.inner!.authHeader, 'authorization');
    assert.deepEqual(config.auth, {});
});

test('MSY_X_CONFIG（默认 env）生效：目录取文件所在目录', async () => {
    const { dir, file } = await makeTempEnv();
    const previous = process.env.MSY_X_CONFIG;
    process.env.MSY_X_CONFIG = file;
    try {
        // 不传 env，走 process.env 默认路径（只读路径计算，不落盘）
        assert.equal(getConfigDir(), dir);
        assert.equal(getConfigFilePath(), file);
    } finally {
        if (previous === undefined) {
            delete process.env.MSY_X_CONFIG;
        } else {
            process.env.MSY_X_CONFIG = previous;
        }
    }
});

test('坏 YAML → CliError CONFIG（退 2），且原文件不被改写', async () => {
    const { env, file } = await makeTempEnv();
    const broken = 'currentSite: x\nsites: {invalid: yaml:'; // 未闭合 flow mapping
    await writeFile(file, broken, 'utf8');

    await assert.rejects(
        readConfig(env),
        (error: unknown) => {
            assert.ok(error instanceof CliError, '应为 CliError');
            assert.equal(error.code, 'CONFIG');
            assert.equal(error.exitCode, ExitCode.USAGE);
            assert.match(error.hint ?? '', /doctor/);
            return true;
        },
    );
    // 只读不写：原文件内容逐字节保留
    assert.equal(await readFile(file, 'utf8'), broken);
});

test('YAML 合法但结构非法 → CliError CONFIG，原文件同样保留', async () => {
    const { env, file } = await makeTempEnv();
    const invalid = 'currentSite: x\n'; // 缺 sites / auth
    await writeFile(file, invalid, 'utf8');
    await assert.rejects(readConfig(env), (error: unknown) => {
        assert.ok(error instanceof CliError);
        assert.equal(error.code, 'CONFIG');
        return true;
    });
    assert.equal(await readFile(file, 'utf8'), invalid);

    const badEnum = [
        'currentSite: x',
        'sites:',
        '  x:',
        '    mcpUrl: https://x.brandct.com/api/v1/mcp',
        '    authMode: magic',
        '    authHeader: authorization',
        'auth: {}',
        '',
    ].join('\n');
    await writeFile(file, badEnum, 'utf8');
    await assert.rejects(readConfig(env), /CliError|authMode|结构/);
    assert.equal(await readFile(file, 'utf8'), badEnum);
});

test('writeConfig 原子写：内容正确、文件 0600、目录 0700、无临时文件残留', async () => {
    const { env, dir, file } = await makeTempEnv();
    const config = defaultConfig();
    config.auth.x = { mode: 'pat', pat: 'ldpat_testtoken0000000000000000000000' };
    await writeConfig(config, env);

    const text = await readFile(file, 'utf8');
    assert.ok(typeof yaml.load(text) === 'object', '落盘内容应是合法 YAML 对象');
    assert.deepEqual(await readConfig(env), config);

    if (isPosix) {
        assert.equal(await getMode(file), 0o600);
        assert.equal(await getMode(dir), 0o700);
    }
    const entries = (await readdir(dir)).sort();
    assert.deepEqual(entries, ['config.yaml']);
});

test('OAuth 凭证（含 null 字段）读写往返一致', async () => {
    const { env } = await makeTempEnv();
    const config = defaultConfig();
    const oauth: OAuthCredentials = {
        mode: 'oauth',
        clientId: 'msy-x-cli',
        clientSecret: null,
        redirectUri: 'http://127.0.0.1:53721/callback',
        accessToken: 'at_test',
        accessExpiresAt: '2026-11-16T12:00:00.000Z',
        refreshToken: null,
        scope: 'mcp:read',
    };
    config.auth.x = oauth;
    await writeConfig(config, env);
    assert.deepEqual((await readConfig(env)).auth.x, oauth);
});

test('writeConfig 自动创建缺失目录（0700）并写文件（0600）', async () => {
    const { dir } = await makeTempEnv();
    const nested = path.join(dir, 'nested', 'deep');
    const file = path.join(nested, 'config.yaml');
    await writeConfig(defaultConfig(), { MSY_X_CONFIG: file });
    if (isPosix) {
        assert.equal(await getMode(nested), 0o700);
        assert.equal(await getMode(file), 0o600);
    }
    assert.deepEqual(await readConfig({ MSY_X_CONFIG: file }), defaultConfig());
});

test('ensureConfigDir 幂等且保持 0700；ensureFileMode 收敛到 0600', async () => {
    const { env, dir } = await makeTempEnv();
    await ensureConfigDir(env);
    await ensureConfigDir(env);
    if (isPosix) {
        assert.equal(await getMode(dir), 0o700);
        const loose = path.join(dir, 'loose.txt');
        await writeFile(loose, 'x', { mode: 0o644 });
        await ensureFileMode(loose);
        assert.equal(await getMode(loose), 0o600);
    }
});

test('getConfigPathForDisplay 返回 MSY_X_CONFIG 指定的绝对路径（不含任何凭证）', async () => {
    const { file } = await makeTempEnv();
    const displayed = getConfigPathForDisplay({ MSY_X_CONFIG: file });
    assert.equal(displayed, file);
    assert.doesNotMatch(displayed, /ldpat_|access_token/i);
});
