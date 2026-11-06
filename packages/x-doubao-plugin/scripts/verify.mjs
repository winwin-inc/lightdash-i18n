#!/usr/bin/env node
/**
 * 豆包插件发布前自检 —— 把开放平台会卡住的规则提前跑一遍。
 *
 *   node scripts/verify.mjs [插件包目录，默认 ./plugin]
 *
 * 规则来源：豆包开放平台「插件总览 / MCP Server / 技能开发规范」。
 * 任何一条 FAIL 都会导致控制台提交校验不通过。
 */
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.argv[2] ? path.resolve(process.argv[2]) : path.join(HERE, '..', 'plugin');

const LIMITS = {
    zipBytes: 16 * 1024 * 1024,
    entries: 1024,
    singleFileBytes: 2 * 1024 * 1024,
    skills: 10,
    mcpServers: 10,
    pluginName: 64,
    pluginDescription: 1024,
    skillDescription: 300,
    iconBytes: 500 * 1024,
};

const results = [];
const ok = (msg) => results.push({ level: 'PASS', msg });
const fail = (msg) => results.push({ level: 'FAIL', msg });
const warn = (msg) => results.push({ level: 'WARN', msg });

/** 包内出现即视为「真实凭据」，平台会标记风险，插件包更是硬性禁止 */
const SECRET_PATTERNS = [
    /ldpat_[A-Za-z0-9]{8,}/,
    /sk-[A-Za-z0-9]{16,}/,
    /"password"\s*:\s*"[^"]{4,}"/i,
    /(?:api[_-]?key|token)\s*[=:]\s*['"][A-Za-z0-9_\-]{12,}['"]/i,
];

const NAME_RE = /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])$/;
const SKILL_NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const CRED_ID_RE = /^[A-Za-z][A-Za-z0-9_]*$/;

async function readJson(file) {
    const raw = await readFile(file, 'utf8');
    return JSON.parse(raw);
}

async function exists(file) {
    try {
        await stat(file);
        return true;
    } catch {
        return false;
    }
}

/** 极简 YAML frontmatter 解析：只支持一层 key: value 与一层嵌套 */
function parseFrontmatter(text) {
    const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
    if (!match) return null;
    const root = {};
    let current = root;
    for (const rawLine of match[1].split(/\r?\n/)) {
        if (!rawLine.trim() || rawLine.trim().startsWith('#')) continue;
        const indent = rawLine.length - rawLine.trimStart().length;
        const line = rawLine.trim();
        const idx = line.indexOf(':');
        if (idx <= 0) continue;
        const key = line.slice(0, idx).trim();
        const rawValue = line.slice(idx + 1).trim();
        if (indent > 0) {
            if (typeof current !== 'object' || Array.isArray(current)) continue;
            current[key] = stripQuotes(rawValue);
        } else if (rawValue === '') {
            current[key] = {};
            current = current[key];
        } else {
            root[key] = stripQuotes(rawValue);
            current = root;
        }
    }
    return root;
}

function stripQuotes(value) {
    if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
    ) {
        return value.slice(1, -1);
    }
    return value;
}

async function readPngSize(file) {
    const buf = await readFile(file);
    if (buf.length < 24) return null;
    const signature = buf.subarray(0, 8).toString('hex');
    if (signature !== '89504e470d0a1a0a') return null;
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), bytes: buf.length };
}

async function walk(dir, baseDir = dir) {
    const out = [];
    for (const entry of await readdir(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            out.push(...(await walk(full, baseDir)));
        } else {
            out.push({ full, rel: path.relative(baseDir, full).split(path.sep).join('/') });
        }
    }
    return out;
}

// ── 1. 包结构 ───────────────────────────────────────────────────────
const pluginJsonPath = path.join(ROOT, 'plugin.json');
if (!(await exists(pluginJsonPath))) {
    fail('缺少根清单 plugin.json');
    report();
}

let plugin;
try {
    plugin = await readJson(pluginJsonPath);
    ok('plugin.json 可解析');
} catch (err) {
    fail(`plugin.json 解析失败：${err.message}`);
    report();
}

if (typeof plugin.name !== 'string' || !NAME_RE.test(plugin.name)) {
    fail(`plugin.name 不合法：${JSON.stringify(plugin.name)}（1-64，小写字母/数字/连字符/点号，首尾字母数字）`);
} else if (plugin.name.length > LIMITS.pluginName) {
    fail(`plugin.name 超过 ${LIMITS.pluginName} 字符`);
} else if (plugin.name.includes('--') || plugin.name.includes('..')) {
    fail('plugin.name 不得包含连续的 "--" 或 ".."');
} else {
    ok(`plugin.name = ${plugin.name}`);
}

if (plugin.description !== undefined) {
    if (typeof plugin.description !== 'string' || plugin.description.length > LIMITS.pluginDescription) {
        fail(`plugin.description 需为字符串且不超过 ${LIMITS.pluginDescription} 字符`);
    } else {
        ok('plugin.description 长度合规');
    }
}

// ── 2. MCP 连接与展示关联 ───────────────────────────────────────────
const mcpJsonPath = path.join(ROOT, 'mcp.json');
let mcp = null;
if (await exists(mcpJsonPath)) {
    try {
        mcp = await readJson(mcpJsonPath);
        ok('mcp.json 可解析');
    } catch (err) {
        fail(`mcp.json 解析失败：${err.message}`);
    }
}

const mcpKeys = mcp?.mcpServers && typeof mcp.mcpServers === 'object'
    ? Object.keys(mcp.mcpServers)
    : [];

if (mcp) {
    if (mcpKeys.length === 0) {
        fail('mcp.json 的 mcpServers 为空');
    } else if (mcpKeys.length > LIMITS.mcpServers) {
        fail(`MCP 服务数量 ${mcpKeys.length} 超过 ${LIMITS.mcpServers}`);
    } else {
        ok(`MCP 服务 ${mcpKeys.length} 个：${mcpKeys.join(', ')}`);
    }

    const declared = plugin?.extensions?.['com.doubao']?.mcpServers ?? {};
    const declaredKeys = Object.keys(declared);
    const missing = mcpKeys.filter((k) => !declaredKeys.includes(k));
    const extra = declaredKeys.filter((k) => !mcpKeys.includes(k));
    if (missing.length || extra.length) {
        fail(
            `plugin.json 的 extensions["com.doubao"].mcpServers 与 mcp.json 服务键不一致` +
                `（缺：${missing.join(', ') || '无'}；多：${extra.join(', ') || '无'}）`,
        );
    } else if (mcpKeys.length > 0) {
        ok('MCP 展示配置与服务键逐一对应');
    }

    for (const key of mcpKeys) {
        const server = mcp.mcpServers[key] ?? {};
        const where = `mcpServers.${key}`;

        if (!['streamable-http', 'sse'].includes(server.type)) {
            fail(`${where}.type 只能是 streamable-http 或 sse（当前：${server.type}）`);
        }
        if (server.type === 'stdio' || server.command) {
            fail(`${where}：豆包插件不支持本地进程（STDIO）形式的 MCP`);
        }

        let parsedUrl = null;
        try {
            parsedUrl = new URL(server.url);
        } catch {
            fail(`${where}.url 不是合法 URL`);
        }
        if (parsedUrl) {
            if (parsedUrl.protocol !== 'https:') {
                fail(`${where}.url 必须为 https（当前：${parsedUrl.protocol}）`);
            }
            const host = parsedUrl.hostname;
            if (['localhost', '127.0.0.1', '::1', '0.0.0.0'].includes(host)) {
                fail(`${where}.url 不得指向 localhost / 回环地址`);
            }
            if (parsedUrl.username || parsedUrl.password) {
                fail(`${where}.url 不得包含用户名或密码`);
            }
            if (parsedUrl.hash) {
                fail(`${where}.url 不得包含片段标识`);
            }
            if (parsedUrl.protocol === 'https:' && !['localhost', '127.0.0.1', '::1'].includes(host)) {
                ok(`${where}.url 合规：${server.url}`);
            }
        }

        const headers = server.headers ?? {};
        const lower = Object.keys(headers).map((h) => h.toLowerCase());
        if (new Set(lower).size !== lower.length) {
            fail(`${where}.headers 存在仅大小写不同的重复请求头`);
        }
        for (const [name, value] of Object.entries(headers)) {
            if (SECRET_PATTERNS.some((re) => re.test(String(value)))) {
                fail(`${where}.headers.${name} 疑似真实凭据，必须改用 com.doubao/auth 声明`);
            }
        }

        // ── 3. 静态凭据文件 ────────────────────────────────────────
        const authFile = path.join(ROOT, 'com.doubao', 'auth', `${key}.json`);
        const hasAuth = await exists(authFile);
        const display = declared[key] ?? {};
        if (!display.displayName || !display.displayDescription) {
            fail(`${where} 缺少 displayName / displayDescription（MCP 展示配置必填）`);
        }

        if (!hasAuth) {
            ok(`${where}：未提供静态凭据，将按 MCP 标准流程（OAuth 或免鉴权）连接`);
            continue;
        }

        let auth;
        try {
            auth = await readJson(authFile);
        } catch (err) {
            fail(`com.doubao/auth/${key}.json 解析失败：${err.message}`);
            continue;
        }
        const failsBefore = results.filter((r) => r.level === 'FAIL').length;

        const creds = Array.isArray(auth.credentials) ? auth.credentials : [];
        const injections = Array.isArray(auth.injections) ? auth.injections : [];

        if (creds.length === 0) fail(`auth/${key}.json：credentials 不能为空`);
        if (injections.length === 0) fail(`auth/${key}.json：injections 不能为空`);

        const ids = [];
        for (const cred of creds) {
            if (typeof cred.id !== 'string' || !CRED_ID_RE.test(cred.id)) {
                fail(`auth/${key}.json：credential.id 不合法（${JSON.stringify(cred.id)}）`);
                continue;
            }
            if (ids.includes(cred.id)) fail(`auth/${key}.json：credential.id 重复（${cred.id}）`);
            ids.push(cred.id);
            if (typeof cred.label !== 'string' || cred.label.trim() === '') {
                fail(`auth/${key}.json：credential ${cred.id} 缺少非空 label`);
            }
            if (typeof cred.secret !== 'boolean') {
                fail(`auth/${key}.json：credential ${cred.id} 的 secret 必须是 boolean（必填）`);
            }
            if (cred.description !== undefined && String(cred.description).length > 1024) {
                fail(`auth/${key}.json：credential ${cred.id} 的 description 超过 1024 字符`);
            }
        }

        const injectionNames = [];
        for (const injection of injections) {
            if (injection.target !== 'header') {
                fail(`auth/${key}.json：injection.target 必须为 header（当前：${injection.target}）`);
            }
            const name = String(injection.name ?? '');
            if (!name) fail(`auth/${key}.json：injection.name 不能为空`);
            const lowerName = name.toLowerCase();
            if (injectionNames.includes(lowerName)) {
                fail(`auth/${key}.json：注入请求头重复（${name}）`);
            }
            injectionNames.push(lowerName);
            if (Object.keys(headers).some((h) => h.toLowerCase() === lowerName)) {
                fail(`auth/${key}.json：注入头 ${name} 与 mcp.json.headers 冲突`);
            }
            const refs = [...String(injection.value ?? '').matchAll(/\$\{([^}]+)\}/g)].map((m) => m[1]);
            if (refs.length === 0) {
                fail(`auth/${key}.json：injection ${name} 的 value 未引用任何 \${id}`);
            }
            for (const ref of refs) {
                if (!ids.includes(ref)) {
                    fail(`auth/${key}.json：injection ${name} 引用了未声明的凭据 ${ref}`);
                }
            }
        }

        const secretFields = creds.filter((c) => c.secret === true).map((c) => c.label);
        const failsNow = results.filter((r) => r.level === 'FAIL').length;
        if (failsNow > failsBefore) {
            // 已有 FAIL，不再输出误导性的「合规」
        } else if (secretFields.length > 0) {
            ok(`auth/${key}.json 合规：${creds.length} 个输入项，注入 ${injections.length} 个请求头（遮蔽：${secretFields.join('、')}）`);
        } else {
            warn(`auth/${key}.json：没有 secret=true 的输入项，确认这不是敏感凭据`);
        }
    }
} else if (plugin?.extensions?.['com.doubao']?.mcpServers) {
    fail('plugin.json 声明了 mcpServers，但缺少 mcp.json');
}

// ── 4. 技能包 ───────────────────────────────────────────────────────
const skillsDir = path.join(ROOT, 'skills');
let skillDirs = [];
if (await exists(skillsDir)) {
    skillDirs = (await readdir(skillsDir, { withFileTypes: true }))
        .filter((e) => e.isDirectory())
        .map((e) => e.name);
}

if (skillDirs.length > LIMITS.skills) {
    fail(`Skill 数量 ${skillDirs.length} 超过 ${LIMITS.skills}`);
} else {
    ok(`Skill ${skillDirs.length} 个：${skillDirs.join(', ') || '无'}`);
}

const skillNames = [];
for (const dir of skillDirs) {
    const skillFile = path.join(skillsDir, dir, 'SKILL.md');
    if (!(await exists(skillFile))) {
        fail(`skills/${dir} 缺少 SKILL.md`);
        continue;
    }
    const text = await readFile(skillFile, 'utf8');
    const fm = parseFrontmatter(text);
    if (!fm) {
        fail(`skills/${dir}/SKILL.md 缺少 YAML frontmatter`);
        continue;
    }
    if (typeof fm.name !== 'string' || !SKILL_NAME_RE.test(fm.name) || fm.name.length > 64) {
        fail(`skills/${dir}：name 不合法（${JSON.stringify(fm.name)}）`);
    } else if (skillNames.includes(fm.name)) {
        fail(`skills/${dir}：name 重复（${fm.name}）`);
    } else {
        skillNames.push(fm.name);
        if (fm.name !== dir) warn(`skills/${dir}：目录名与 name（${fm.name}）不一致，建议一致`);
    }

    if (typeof fm.description !== 'string' || fm.description.trim() === '') {
        fail(`skills/${dir}：description 必填`);
    } else if (fm.description.length > LIMITS.skillDescription) {
        fail(`skills/${dir}：description ${fm.description.length} 字符，超过 ${LIMITS.skillDescription}`);
    } else {
        ok(`skills/${dir}：description ${fm.description.length}/${LIMITS.skillDescription} 字符`);
    }

    if (fm.metadata !== undefined) {
        if (typeof fm.metadata !== 'object' || Array.isArray(fm.metadata)) {
            fail(`skills/${dir}：metadata 必须是字符串映射`);
        } else {
            for (const [k, v] of Object.entries(fm.metadata)) {
                if (typeof v !== 'string') {
                    fail(`skills/${dir}：metadata.${k} 必须是字符串（YAML 里请加引号）`);
                }
            }
        }
    }

    const icon = fm.metadata?.icon;
    if (icon) {
        if (!icon.startsWith('./')) {
            fail(`skills/${dir}：metadata.icon 必须以 ./ 开头（${icon}）`);
        } else {
            const iconPath = path.join(skillsDir, dir, icon);
            if (!(await exists(iconPath))) {
                fail(`skills/${dir}：icon 文件不存在（${icon}）`);
            } else {
                const size = await readPngSize(iconPath);
                if (!size) {
                    fail(`skills/${dir}：icon 必须是 PNG（自检仅校验 PNG 尺寸）`);
                } else if (size.width !== 512 || size.height !== 512) {
                    fail(`skills/${dir}：icon 必须 512×512（当前 ${size.width}×${size.height}）`);
                } else if (size.bytes > LIMITS.iconBytes) {
                    fail(`skills/${dir}：icon ${size.bytes}B 超过 ${LIMITS.iconBytes}B`);
                } else {
                    ok(`skills/${dir}：icon 512×512 ${size.bytes}B`);
                }
            }
        }
    }
}

// ── 5. 包体积与敏感信息 ─────────────────────────────────────────────
const files = await walk(ROOT);
let total = 0;
let tooBig = [];
for (const file of files) {
    const info = await stat(file.full);
    total += info.size;
    if (info.size > LIMITS.singleFileBytes) tooBig.push(file.rel);
    if (file.rel.includes('..')) fail(`非法路径：${file.rel}`);
}
if (files.length > LIMITS.entries) fail(`文件条目 ${files.length} 超过 ${LIMITS.entries}`);
if (total > LIMITS.zipBytes) fail(`解压总量 ${(total / 1024 / 1024).toFixed(1)}MB 超过 16MB`);
if (tooBig.length) fail(`单文件超过 2MB：${tooBig.join(', ')}`);
if (files.length <= LIMITS.entries && total <= LIMITS.zipBytes && tooBig.length === 0) {
    ok(`包体积合规：${files.length} 个文件，共 ${(total / 1024).toFixed(1)}KB`);
}

for (const file of files) {
    if (!/\.(md|json|ya?ml|txt|sh|py|js|ts)$/.test(file.rel)) continue;
    const text = await readFile(file.full, 'utf8');
    for (const pattern of SECRET_PATTERNS) {
        const match = pattern.exec(text);
        if (match) {
            fail(`疑似真实凭据：${file.rel} 命中 ${pattern}（${match[0].slice(0, 24)}…）`);
        }
    }
}

function report() {
    const order = { FAIL: 0, WARN: 1, PASS: 2 };
    results.sort((a, b) => order[a.level] - order[b.level]);
    for (const r of results) {
        const mark = r.level === 'PASS' ? '✓' : r.level === 'WARN' ? '!' : '✗';
        console.log(`${mark} [${r.level}] ${r.msg}`);
    }
    const failed = results.filter((r) => r.level === 'FAIL').length;
    const warned = results.filter((r) => r.level === 'WARN').length;
    console.log(
        `\n${failed === 0 ? '可以提交' : '不可提交'}：${results.length - failed - warned} 通过，${warned} 警告，${failed} 失败`,
    );
    process.exit(failed === 0 ? 0 : 1);
}

report();
