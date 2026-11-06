#!/usr/bin/env node
/**
 * 技能包自检（对应「技能 → 上传技能」入口）。
 *
 *   node scripts/verify-skill.mjs [技能目录，默认 plugin/skills/brandct-x-insight]
 *
 * 规则来源：豆包开放平台「技能开发规范」。
 */
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.argv[2]
    ? path.resolve(process.argv[2])
    : path.join(HERE, '..', 'plugin', 'skills', 'brandct-x-insight');

const LIMITS = {
    zipBytes: 16 * 1024 * 1024,
    entries: 1024,
    singleFileBytes: 2 * 1024 * 1024,
    description: 300,
    name: 64,
    displayName: 128,
    displayDescription: 300,
    iconBytes: 500 * 1024,
};

const NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const results = [];
const ok = (msg) => results.push({ level: 'PASS', msg });
const fail = (msg) => results.push({ level: 'FAIL', msg });
const warn = (msg) => results.push({ level: 'WARN', msg });

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
            if (typeof current === 'object' && !Array.isArray(current)) {
                current[key] = stripQuotes(rawValue);
            }
        } else if (rawValue === '') {
            root[key] = {};
            current = root[key];
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

async function exists(file) {
    try {
        await stat(file);
        return true;
    } catch {
        return false;
    }
}

async function readPngSize(file) {
    const buf = await readFile(file);
    if (buf.length < 24) return null;
    if (buf.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') return null;
    return {
        width: buf.readUInt32BE(16),
        height: buf.readUInt32BE(20),
        bytes: buf.length,
    };
}

async function walk(dir, baseDir = dir) {
    const out = [];
    for (const entry of await readdir(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            out.push(...(await walk(full, baseDir)));
        } else {
            out.push({
                full,
                rel: path.relative(baseDir, full).split(path.sep).join('/'),
            });
        }
    }
    return out;
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

// ── 结构：SKILL.md 必须在技能目录根 ─────────────────────────────────
const skillFile = path.join(ROOT, 'SKILL.md');
if (!(await exists(skillFile))) {
    fail(`缺少 ${path.relative(process.cwd(), skillFile)}：技能目录根必须直接包含 SKILL.md`);
    report();
}
ok('技能目录根包含 SKILL.md');

const text = await readFile(skillFile, 'utf8');
const fm = parseFrontmatter(text);
if (!fm) {
    fail('SKILL.md 缺少 YAML frontmatter（--- 包裹）');
    report();
}
ok('frontmatter 可解析');

if (typeof fm.name !== 'string' || !NAME_RE.test(fm.name)) {
    fail(`name 不合法：${JSON.stringify(fm.name)}（小写字母/数字/连字符，首尾非连字符）`);
} else if (fm.name.length > LIMITS.name) {
    fail(`name 超过 ${LIMITS.name} 字符`);
} else {
    ok(`name = ${fm.name}`);
    if (fm.name !== path.basename(ROOT)) {
        warn(`目录名（${path.basename(ROOT)}）与 name 不一致，建议一致`);
    }
}

if (typeof fm.description !== 'string' || fm.description.trim() === '') {
    fail('description 必填');
} else if (fm.description.length > LIMITS.description) {
    fail(`description ${fm.description.length} 字符，超过 ${LIMITS.description}`);
} else {
    ok(`description ${fm.description.length}/${LIMITS.description} 字符`);
}

if (fm.metadata !== undefined) {
    if (typeof fm.metadata !== 'object' || Array.isArray(fm.metadata)) {
        fail('metadata 必须是字符串映射');
    } else {
        ok(`metadata 键：${Object.keys(fm.metadata).join(', ')}`);
        for (const [k, v] of Object.entries(fm.metadata)) {
            if (typeof v !== 'string') {
                fail(`metadata.${k} 必须是字符串（YAML 里请加引号）`);
            }
        }
        const displayName = fm.metadata.display_name;
        const displayDesc = fm.metadata.display_description;
        if (displayName !== undefined && displayName.length > LIMITS.displayName) {
            fail(`metadata.display_name 超过 ${LIMITS.displayName} 字符`);
        }
        if (displayDesc !== undefined && displayDesc.length > LIMITS.displayDescription) {
            fail(`metadata.display_description 超过 ${LIMITS.displayDescription} 字符`);
        }
    }
}

const icon = fm.metadata?.icon;
if (!icon) {
    warn('未提供 metadata.icon；商店会使用默认图标');
} else if (!icon.startsWith('./')) {
    fail(`metadata.icon 必须以 ./ 开头（当前：${icon}）`);
} else {
    const iconPath = path.join(ROOT, icon);
    if (!(await exists(iconPath))) {
        fail(`icon 文件不存在：${icon}`);
    } else {
        const size = await readPngSize(iconPath);
        if (!size) {
            fail('icon 必须是 PNG（自检仅校验 PNG 尺寸）');
        } else if (size.width !== 512 || size.height !== 512) {
            fail(`icon 必须 512×512（当前 ${size.width}×${size.height}）`);
        } else if (size.bytes > LIMITS.iconBytes) {
            fail(`icon ${size.bytes}B 超过 ${LIMITS.iconBytes}B`);
        } else {
            ok(`icon 512×512，${size.bytes}B`);
        }
    }
}

// ── 引用资源与体积 ─────────────────────────────────────────────────
const files = await walk(ROOT);
let total = 0;
for (const file of files) {
    const info = await stat(file.full);
    total += info.size;
    if (info.size > LIMITS.singleFileBytes) {
        fail(`单文件超过 2MB：${file.rel}`);
    }
    if (file.rel.includes('..')) fail(`非法路径：${file.rel}`);
}

// 正文里引用的相对链接必须随包存在
const links = [...text.matchAll(/\]\((\.\/[^)\s]+)\)/g)].map((m) => m[1]);
for (const link of links) {
    if (!(await exists(path.join(ROOT, link)))) {
        fail(`SKILL.md 引用的文件不存在：${link}`);
    }
}
if (links.length > 0) ok(`正文引用资源 ${links.length} 个，均存在`);

if (files.length > LIMITS.entries) fail(`文件条目 ${files.length} 超过 ${LIMITS.entries}`);
if (total > LIMITS.zipBytes) fail(`解压总量超过 16MB`);
if (files.length <= LIMITS.entries && total <= LIMITS.zipBytes) {
    ok(`体积合规：${files.length} 个文件，共 ${(total / 1024).toFixed(1)}KB`);
}

report();
