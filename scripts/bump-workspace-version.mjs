#!/usr/bin/env node
/**
 * 设置 monorepo 根与 workspace 的 package.json version，跳过 packages/lightdash-*（单独维护）。
 *
 * 用法：
 *   pnpm bump-version -- 0.2105.4
 *   node scripts/bump-workspace-version.mjs 0.2105.4
 *
 * 默认：写文件 → git add（仅 version 文件）→ git commit → git tag -a v<ver>
 * 开关：--no-commit 仅写文件；--no-tag 仅 commit，不打 tag。
 * 本地不 push；推送 tag 后触发 CI .github/workflows/build-docker-with-i18n.yml
 *
 * 行为对齐（写版本部分）：
 *   npm version <ver> --workspaces --include-workspace-root --allow-same-version --no-git-tag-version
 * 但不改动 packages/lightdash-*（mcp / charts-viewer / skills 等）。
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '..');

const SEMVER_RE = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;

function usage() {
    process.stderr.write(`用法:
  node scripts/bump-workspace-version.mjs <version> [--no-commit] [--no-tag]
  pnpm bump-version -- <version> [--no-commit] [--no-tag]

示例:
  pnpm bump-version -- 0.2105.4
  pnpm bump-version -- 0.2105.4 --no-commit
  pnpm bump-version -- 0.2105.4 --no-tag

跳过目录: packages/lightdash-*（单独发版，请用 pnpm bump-mcp-skills）
默认行为：写文件 -> 仅 add version 文件 -> git commit -> 打 v<ver> annotated tag。
开关：--no-commit 仅写文件；--no-tag commit 后不打 tag。
本地不 push；确认无误后：git push && git push origin v<版本号> 触发主站 Docker CI。
`);
}

function normalizeVersion(raw) {
    const v = raw.replace(/^v/i, '');
    if (!SEMVER_RE.test(v)) {
        process.stderr.write(
            `非法版本号: ${raw}（需形如 0.2105.4 或 1.2.3-rc.1）\n`,
        );
        process.exit(1);
    }
    return v;
}

function toPosix(p) {
    return p.split(path.sep).join('/');
}

function normalizeRepoPath(p) {
    return path.normalize(p).replace(/\\/g, '/');
}

function isSkippedPackageDir(absDir) {
    const rel = toPosix(path.relative(repoRoot, absDir));
    // packages/lightdash-mcp, packages/lightdash-charts-viewer, ...
    return /^packages\/lightdash-[^/]+$/.test(rel);
}

function writePackageVersion(pkgPath, version) {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    const prev = pkg.version;
    pkg.version = version;
    fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 4)}\n`);
    return prev;
}

function collectPackageJsonPaths() {
    const paths = [path.join(repoRoot, 'package.json')];

    const packagesDir = path.join(repoRoot, 'packages');
    for (const entry of fs.readdirSync(packagesDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const dir = path.join(packagesDir, entry.name);
        const pkgJson = path.join(dir, 'package.json');
        if (fs.existsSync(pkgJson)) {
            paths.push(pkgJson);
        }
    }

    const frontendSdkPkg = path.join(
        repoRoot,
        'packages',
        'frontend',
        'sdk',
        'package.json',
    );
    if (fs.existsSync(frontendSdkPkg)) {
        paths.push(frontendSdkPkg);
    }

    return paths;
}

/**
 * 返回将要改写的 package.json 相对路径（跳过 packages/lightdash-*）。
 */
function collectTargetRelPaths() {
    const relPaths = [];
    for (const pkgPath of collectPackageJsonPaths()) {
        const pkgDir = path.dirname(pkgPath);
        if (pkgDir !== repoRoot && isSkippedPackageDir(pkgDir)) {
            continue;
        }
        relPaths.push(toPosix(path.relative(repoRoot, pkgPath)));
    }
    return relPaths;
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
    const r = spawnSync('git', ['rev-parse', '-q', '--verify', `refs/tags/${tag}`], {
        stdio: 'ignore',
        cwd: repoRoot,
    });
    if (r.status === 0) {
        process.stderr.write(
            `tag ${tag} 已存在；请删除或换版本号\n例如: git tag -d ${tag}\n`,
        );
        process.exit(1);
    }
}

function writeAllVersions(version) {
    const updated = [];
    const skipped = [];
    const unchanged = [];
    const targetRelPaths = [];

    for (const pkgPath of collectPackageJsonPaths()) {
        const pkgDir = path.dirname(pkgPath);
        const rel = toPosix(path.relative(repoRoot, pkgPath));

        if (pkgDir !== repoRoot && isSkippedPackageDir(pkgDir)) {
            skipped.push(rel);
            continue;
        }

        targetRelPaths.push(rel);
        const prev = writePackageVersion(pkgPath, version);
        if (prev === version) {
            unchanged.push(rel);
        } else {
            updated.push(`${rel}: ${prev} -> ${version}`);
        }
    }

    process.stdout.write(`目标版本: ${version}\n`);
    if (updated.length > 0) {
        process.stdout.write('\n已更新:\n');
        for (const line of updated) {
            process.stdout.write(`  ${line}\n`);
        }
    }
    if (unchanged.length > 0) {
        process.stdout.write('\n已是目标版本（仍写入）:\n');
        for (const line of unchanged) {
            process.stdout.write(`  ${line}\n`);
        }
    }
    if (skipped.length > 0) {
        process.stdout.write('\n已跳过 (packages/lightdash-*):\n');
        for (const line of skipped) {
            process.stdout.write(`  ${line}\n`);
        }
    }

    return targetRelPaths;
}

const rawVersion = process.argv[2]?.trim();
const flags = process.argv.slice(3);
const noCommit = flags.includes('--no-commit');
const noTag = flags.includes('--no-tag');

if (!rawVersion || rawVersion === '-h' || rawVersion === '--help') {
    usage();
    process.exit(rawVersion ? 0 : 1);
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
const tagName = `v${version}`;
const willTag = !noCommit && !noTag;

if (noCommit) {
    writeAllVersions(version);
    process.stdout.write(
        '\n提示（--no-commit）：未执行 git；如需一条龙 commit + tag，请去掉 --no-commit 并在干净工作区重跑。\nMCP/skills 请用: pnpm bump-mcp-skills -- <version>\n',
    );
    process.exit(0);
}

ensureGitRepo();
const targetRelPaths = collectTargetRelPaths();
ensureCleanExceptVersionFiles(targetRelPaths);
if (willTag) {
    ensureTagAbsent(tagName);
}

writeAllVersions(version);

for (const rel of targetRelPaths) {
    git(['add', rel]);
}
git(['commit', '-m', `chore(release): 升级所有包至 ${version}`]);

if (willTag) {
    git(['tag', '-a', tagName, '-m', `lightdash v${version}`]);
    process.stdout.write(`已创建 annotated tag: ${tagName}\n`);
} else {
    process.stdout.write('（已跳过打 tag：使用了 --no-tag）\n');
}

process.stdout.write('\n下一步：\n');
process.stdout.write('  git push\n');
if (willTag) {
    process.stdout.write(
        `  git push origin ${tagName}\n（推送上述 tag 触发仓库根 .github/workflows/build-docker-with-i18n.yml）\n`,
    );
} else {
    process.stdout.write(
        '（未创建 tag；触发主站镜像 CI 需推送 v* tag）\n',
    );
}
process.stdout.write('MCP/skills 请用: pnpm bump-mcp-skills -- <version>\n');
