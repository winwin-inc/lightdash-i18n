import assert from 'node:assert/strict';
import test from 'node:test';
import { CliError } from '../cli/errors';
import { ExitCode } from '../cli/exitCodes';
import type { CliConfig, GlobalOptions } from '../types';
import { resolveSite } from './profiles';

const makeConfig = (currentSite = 'x'): CliConfig => ({
    currentSite,
    sites: {
        x: {
            mcpUrl: 'https://x.brandct.com/api/v1/mcp',
            authMode: 'oauth',
            authHeader: 'authorization',
        },
        inner: {
            mcpUrl: 'https://lightdash.banmahui.cn/api/v1/mcp',
            authMode: 'pat',
            authHeader: 'authorization',
        },
    },
    auth: {},
});

const opts = (
    site: string | null = null,
    mcpUrl: string | null = null,
): Pick<GlobalOptions, 'site' | 'mcpUrl'> => ({ site, mcpUrl });

const noEnv = {};

test('无任何覆盖时使用 config.currentSite（默认 x）', () => {
    assert.deepEqual(resolveSite({ options: opts(), config: makeConfig(), env: noEnv }), {
        name: 'x',
        mcpUrl: 'https://x.brandct.com/api/v1/mcp',
        authMode: 'oauth',
        authHeader: 'authorization',
    });
});

test('config.currentSite 指向 inner 时取 inner（PAT）', () => {
    const profile = resolveSite({
        options: opts(),
        config: makeConfig('inner'),
        env: noEnv,
    });
    assert.equal(profile.name, 'inner');
    assert.equal(profile.mcpUrl, 'https://lightdash.banmahui.cn/api/v1/mcp');
    assert.equal(profile.authMode, 'pat');
});

test('--mcp-url 优先级最高，且去尾斜杠', () => {
    const profile = resolveSite({
        options: opts('inner', 'https://custom.example.com/api/v1/mcp/'),
        config: makeConfig(),
        env: {
            MSY_X_MCP_URL: 'https://env-mcp.example.com/api/v1/mcp',
            MSY_X_SITE_URL: 'https://env-site.example.com',
        },
    });
    assert.equal(profile.mcpUrl, 'https://custom.example.com/api/v1/mcp');
    // 未配置过的地址：URL 即 name，v2 默认 oauth + authorization
    assert.equal(profile.name, 'https://custom.example.com/api/v1/mcp');
    assert.equal(profile.authMode, 'oauth');
    assert.equal(profile.authHeader, 'authorization');
});

test('--mcp-url 命中已配置站点时继承 name/authMode/authHeader', () => {
    const profile = resolveSite({
        options: opts(null, 'https://x.brandct.com/api/v1/mcp'),
        config: makeConfig(),
        env: noEnv,
    });
    assert.equal(profile.name, 'x');
    assert.equal(profile.authMode, 'oauth');
});

test('--site 传 http(s) URL：按 URL 解析（含去尾斜杠）', () => {
    const profile = resolveSite({
        options: opts('https://x.brandct.com/api/v1/mcp/'),
        config: makeConfig(),
        env: noEnv,
    });
    assert.equal(profile.name, 'x');
    assert.equal(profile.mcpUrl, 'https://x.brandct.com/api/v1/mcp');
});

test('--site 含 /mcp 但无 scheme：同样按 URL，且保留原样不补 /mcp', () => {
    const profile = resolveSite({
        options: opts('lightdash.banmahui.cn:8443/mcp'),
        config: makeConfig(),
        env: noEnv,
    });
    assert.equal(profile.mcpUrl, 'lightdash.banmahui.cn:8443/mcp');
    assert.equal(profile.name, 'lightdash.banmahui.cn:8443/mcp');
});

test('--site 缺 /mcp 的 URL 保留原样（不擅自补路径）', () => {
    const profile = resolveSite({
        options: opts('https://x.brandct.com'),
        config: makeConfig(),
        env: noEnv,
    });
    assert.equal(profile.mcpUrl, 'https://x.brandct.com');
});

test('--site 传已配置站点名', () => {
    const profile = resolveSite({
        options: opts('inner'),
        config: makeConfig(),
        env: noEnv,
    });
    assert.equal(profile.name, 'inner');
    assert.equal(profile.authMode, 'pat');
});

test('--site 优先于环境变量', () => {
    const profile = resolveSite({
        options: opts('inner'),
        config: makeConfig(),
        env: { MSY_X_MCP_URL: 'https://env-mcp.example.com/api/v1/mcp' },
    });
    assert.equal(profile.name, 'inner');
});

test('未知站点名 → CONFIG 错误，hint 列出全部可用站点', () => {
    assert.throws(
        () => resolveSite({ options: opts('nope'), config: makeConfig(), env: noEnv }),
        (error: unknown) => {
            assert.ok(error instanceof CliError);
            assert.equal(error.code, 'CONFIG');
            assert.equal(error.exitCode, ExitCode.USAGE);
            const hint = error.hint ?? '';
            assert.match(hint, /可用站点/);
            assert.match(hint, /\bx\b/);
            assert.match(hint, /\binner\b/);
            assert.ok(!hint.includes('nope'));
            return true;
        },
    );
});

test('配置残缺：currentSite 指向不存在的站点 → CONFIG 错误', () => {
    const config = makeConfig('ghost');
    assert.throws(
        () => resolveSite({ options: opts(), config, env: noEnv }),
        (error: unknown) => {
            assert.ok(error instanceof CliError);
            assert.equal(error.code, 'CONFIG');
            return true;
        },
    );
});

test('MSY_X_MCP_URL 优先于 MSY_X_SITE_URL', () => {
    const profile = resolveSite({
        options: opts(),
        config: makeConfig(),
        env: {
            MSY_X_MCP_URL: 'https://env-mcp.example.com/api/v1/mcp',
            MSY_X_SITE_URL: 'https://env-site.example.com',
        },
    });
    assert.equal(profile.mcpUrl, 'https://env-mcp.example.com/api/v1/mcp');
});

test('MSY_X_SITE_URL 自动拼 /api/v1/mcp（先去尾斜杠）', () => {
    const profile = resolveSite({
        options: opts(),
        config: makeConfig(),
        env: { MSY_X_SITE_URL: 'https://brandct.example.com/' },
    });
    assert.equal(profile.mcpUrl, 'https://brandct.example.com/api/v1/mcp');
});

test('MSY_X_SITE_URL 已含 /api/v1/mcp 时不重复拼接', () => {
    const profile = resolveSite({
        options: opts(),
        config: makeConfig(),
        env: { MSY_X_SITE_URL: 'https://x.brandct.com/api/v1/mcp' },
    });
    assert.equal(profile.mcpUrl, 'https://x.brandct.com/api/v1/mcp');
    assert.equal(profile.name, 'x'); // 拼接后命中已配置站点
});

test('空白环境变量视为未设置', () => {
    const profile = resolveSite({
        options: opts(),
        config: makeConfig(),
        env: { MSY_X_MCP_URL: '   ', MSY_X_SITE_URL: '' },
    });
    assert.equal(profile.name, 'x');
});
