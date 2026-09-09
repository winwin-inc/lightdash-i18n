#!/usr/bin/env node
/**
 * 升级 packages/lightdash-mcp 的 package.json.version，并打 mcp-v* tag。
 *
 * 用法：
 *   pnpm bump-mcp -- 0.4.4
 *   node scripts/bump-versions.mjs 0.4.4
 *
 * 默认：写文件 → git add（仅 MCP package.json）→ git commit → git tag -a mcp-v<ver>
 * 开关：--no-commit 仅写文件；--no-tag 仅 commit，不打 tag。
 * 本地不 push；推送 tag 后触发 CI .github/workflows/build-docker-mcp.yml
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '..');
const mcpPkgPath = path.join(repoRoot, 'packages', 'lightdash-mcp', 'package.json');

/** 仓库根相对路径（正斜杠），供 git 状态校验 */
const REL_MCP_PKG = 'packages/lightdash-mcp/package.json';

const SEMVER_RE = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;

function usage() {
    process.stderr.write(`用法:
  node scripts/bump-versions.mjs <version> [--no-commit] [--no-tag]
  pnpm bump-mcp -- <version> [--no-commit] [--no-tag]

示例:
  pnpm bump-mcp -- 0.4.4
  pnpm bump-mcp -- 0.4.4 --no-commit
  pnpm bump-mcp -- 0.4.4 --no-tag

默认行为：写 packages/lightdash-mcp/package.json -> 仅 add 该文件 -> git commit -> 打 mcp-v<ver> annotated tag。
开关：--no-commit 仅写文件；--no-tag commit 后不打 tag。
本地不 push；确认无误后：git push && git push origin mcp-v<版本号> 触发 MCP Docker CI。
`);
}

function normalizeVersion(raw) {
    const v = raw.replace(/^v/i, '').replace(/^mcp-v/i, '');
    if (!SEMVER_RE.test(v)) {
        process.stderr.write(
            `非法版本号: ${raw}（需形如 0.0.3 或 1.2.3-rc.1）\n`,
        );
        process.exit(1);
    }
    return v;
}

function normalizeRepoPath(p) {
    return path.normalize(p).replace(/\\/g, '/');
}

function git(args, { capture = false } = {}) {
    const r = spawnSync('git', args, {
        stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
        cwd: repoRoot,
        encoding: 'utf8',
    });
    if (r.status !== 0) {
        if (capture && r.stderr) {
            process.stderr.write(r.stderr);
        }
        process.exit(r.status ?? 1);
    }
    return capture ? (r.stdout ?? '').trim() : '';
}

function ensureGitRepo() {
    const r = spawnSync('git', ['rev-parse', '--git-dir'], {
        stdio: ['ignore', 'pipe', 'pipe'],
        cwd: repoRoot,
        encoding: 'utf8',
    });
    if (r.status !== 0) {
        process.stderr.write(
            '当前目录不是 git 仓库，或无法执行 git。请在仓库根运行本脚本。\n',
        );
        process.exit(1);
    }
}

/**
 * 工作区除 allowed 列出的相对路径外，不得有任何已修改/已暂存/未跟踪文件。
 */
function ensureCleanExceptVersionFiles(allowedRelPaths) {
    const r = spawnSync('git', ['status', '--porcelain'], {
        stdio: ['ignore', 'pipe', 'pipe'],
        cwd: repoRoot,
        encoding: 'utf8',
    });
    if (r.status !== 0) {
        process.stderr.write(r.stderr ?? 'git status 失败\n');
        process.exit(r.status ?? 1);
    }
    const lines = (r.stdout ?? '')
        .split(/\r?\n/)
        .map((l) => l.trimEnd())
        .filter(Boolean);
    const allowed = new Set(allowedRelPaths.map((p) => normalizeRepoPath(p)));
    for (const line of lines) {
        let filePath;
        if (line.startsWith('??')) {
            filePath = line.slice(3).trim();
        } else {
            const rest = line.slice(3);
            if (rest.includes(' -> ')) {
                const parts = rest.split(' -> ');
                filePath = parts[parts.length - 1].trim();
            } else {
                filePath = rest.trim();
            }
        }
        const n = normalizeRepoPath(filePath);
        if (!allowed.has(n)) {
            process.stderr.write(
                `工作区有未提交改动: ${n}\n请先 commit 或 stash 其他文件，仅留下本脚本将要改写的 version 文件后再运行。\n`,
            );
            process.exit(1);
        }
    }
}

function ensureTagAbsent(tag) {
    const r = spawnSync(
        'git',
        ['rev-parse', '-q', '--verify', `refs/tags/${tag}`],
        {
            stdio: 'ignore',
            cwd: repoRoot,
        },
    );
    if (r.status === 0) {
        process.stderr.write(
            `tag ${tag} 已存在；请删除或换版本号\n例如: git tag -d ${tag}\n`,
        );
        process.exit(1);
    }
}

function writeJson(filePath, obj) {
    fs.writeFileSync(filePath, `${JSON.stringify(obj, null, 4)}\n`);
}

function bumpMcp(version) {
    const pkg = JSON.parse(fs.readFileSync(mcpPkgPath, 'utf8'));
    pkg.version = version;
    writeJson(mcpPkgPath, pkg);
    process.stdout.write(
        `已写入 packages/lightdash-mcp/package.json -> "version": "${version}"\n`,
    );
}

const rawVersion = process.argv[2]?.trim();
const flags = process.argv.slice(3);
const noCommit = flags.includes('--no-commit');
const noTag = flags.includes('--no-tag');

if (!rawVersion || rawVersion === '-h' || rawVersion === '--help') {
    usage();
    process.exit(rawVersion ? 0 : 1);
}

// 兼容误传旧子命令：pnpm bump-mcp -- mcp|skills|all 0.4.4
if (rawVersion === 'mcp' || rawVersion === 'skills' || rawVersion === 'all') {
    process.stderr.write(
        `已不再支持子命令 "${rawVersion}"；请直接传版本号，例如: pnpm bump-mcp -- 0.4.4\n`,
    );
    usage();
    process.exit(1);
}

if (flags.some((x) => !x.startsWith('--'))) {
    process.stderr.write(
        '多余的位置参数；版本应为第二个参数，开关仅支持 --no-commit / --no-tag\n',
    );
    usage();
    process.exit(1);
}

const unknownFlags = flags.filter(
    (x) => x !== '--no-commit' && x !== '--no-tag',
);
if (unknownFlags.length > 0) {
    process.stderr.write(`未知开关: ${unknownFlags.join(' ')}\n`);
    usage();
    process.exit(1);
}

const version = normalizeVersion(rawVersion);
const tagName = `mcp-v${version}`;
const willTag = !noCommit && !noTag;

if (noCommit) {
    bumpMcp(version);
    process.stdout.write(
        '\n提示（--no-commit）：未执行 git；如需一条龙 commit + tag，请去掉 --no-commit 并在干净工作区重跑。\n',
    );
    process.exit(0);
}

ensureGitRepo();
ensureCleanExceptVersionFiles([REL_MCP_PKG]);
if (willTag) {
    ensureTagAbsent(tagName);
}

bumpMcp(version);
git(['add', REL_MCP_PKG]);
git(['commit', '-m', `chore(release): 升级 lightdash-mcp 至 ${version}`]);

if (willTag) {
    git(['tag', '-a', tagName, '-m', `lightdash-mcp v${version}`]);
    process.stdout.write(`已创建 annotated tag: ${tagName}\n`);
} else {
    process.stdout.write('（已跳过打 tag：使用了 --no-tag）\n');
}

process.stdout.write('\n下一步：\n');
process.stdout.write('  git push\n');
if (willTag) {
    process.stdout.write(
        `  git push origin ${tagName}\n（推送上述 tag 触发仓库根 .github/workflows/build-docker-mcp.yml）\n`,
    );
} else {
    process.stdout.write(
        '（未创建 tag；触发 MCP 镜像 CI 需推送 mcp-v* tag）\n',
    );
}
process.stdout.write('主站请用: pnpm bump-version -- <version>\n');
process.stdout.write('CLI 工具镜像请用: pnpm bump-cli -- <version>\n');
