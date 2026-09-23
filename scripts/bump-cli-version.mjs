#!/usr/bin/env node
/**
 * 升级 packages/cli 的 package.json.version，并打 cli-v* tag（独立于主仓）。
 *
 * 用法：
 *   pnpm bump-cli -- 2.1.6
 *   pnpm bump-cli                 # 使用 packages/cli/package.json 的当前 version
 *   node scripts/bump-cli-version.mjs 2.1.6
 *
 * 默认：写文件 → git add（仅 CLI package.json）→ git commit → git tag -a cli-v<ver>
 * 已是目标版本时不改写，只打 tag。
 * 开关：--no-commit 仅写文件；--no-tag 仅 commit，不打 tag。
 * 本地不 push；推送 tag 后触发 .github/workflows/build-docker-cli.yml
 *   - ACR winwin/tool:lightdash-cli-X.Y.Z
 *   - GitHub Release cli-vX.Y.Z 挂 lightdash-cli-X.Y.Z.tgz（不标 Latest）
 *   - OSS/CDN：msy-x/cli/X.Y.Z/lightdash-cli-X.Y.Z.tgz
 *
 * 若本地/远端已有旧的 cli-v2.1.6（只打了 tag、没改 version），先删再重打：
 *   git tag -d cli-v2.1.6
 *   git push origin :refs/tags/cli-v2.1.6
 *   pnpm bump-cli -- 2.1.6
 *   git push && git push origin cli-v2.1.6
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '..');
const cliPkgPath = path.join(repoRoot, 'packages', 'cli', 'package.json');
const REL_CLI_PKG = 'packages/cli/package.json';

const SEMVER_RE = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;

function usage() {
    const current = readCliPackageVersion();
    process.stderr.write(`用法:
  node scripts/bump-cli-version.mjs [version] [--no-commit] [--no-tag]
  pnpm bump-cli -- <version> [--no-commit] [--no-tag]
  pnpm bump-cli

示例:
  pnpm bump-cli -- 2.1.6
  pnpm bump-cli -- 2.1.6 --no-commit
  pnpm bump-cli -- 2.1.6 --no-tag
  pnpm bump-cli

省略 version 时使用 packages/cli/package.json（当前: ${current ?? '无法读取'}），已是该版本则不改写、只打 tag。
默认：写 packages/cli/package.json -> 仅 add 该文件 -> git commit -> 打 cli-v<ver> annotated tag。
开关：--no-commit 仅写文件；--no-tag commit 后不打 tag。
本地不 push；确认无误后：git push && git push origin cli-v<版本号>
触发 CI：.github/workflows/build-docker-cli.yml
镜像：registry.cn-hangzhou.aliyuncs.com/winwin/tool:lightdash-cli-X.Y.Z
Release：cli-vX.Y.Z 挂 lightdash-cli-X.Y.Z.tgz（不标 Latest）
CDN：https://img0.banmahui.cn/msy-x/cli/X.Y.Z/lightdash-cli-X.Y.Z.tgz
主仓 bump-version 不会改本文件。

若 tag 已存在（例如先前只打了 tag、没改 version）：
  git tag -d cli-v<ver>
  git push origin :refs/tags/cli-v<ver>
  然后重新 pnpm bump-cli -- <ver>
`);
}

function readCliPackageVersion() {
    try {
        const pkg = JSON.parse(fs.readFileSync(cliPkgPath, 'utf8'));
        return typeof pkg.version === 'string' ? pkg.version : null;
    } catch {
        return null;
    }
}

function normalizeVersion(raw) {
    const v = raw.replace(/^v/i, '').replace(/^cli-v/i, '');
    if (!SEMVER_RE.test(v)) {
        process.stderr.write(
            `非法版本号: ${raw}（需形如 2.1.6 或 1.2.3-rc.1）\n`,
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
            `tag ${tag} 已存在；请删除或换版本号\n例如: git tag -d ${tag}\n若远端也有（旧 tag 没改 version）：git push origin :refs/tags/${tag}\n`,
        );
        process.exit(1);
    }
}

function writeJson(filePath, obj) {
    fs.writeFileSync(filePath, `${JSON.stringify(obj, null, 4)}\n`);
}

function bumpCli(version) {
    const pkg = JSON.parse(fs.readFileSync(cliPkgPath, 'utf8'));
    pkg.version = version;
    writeJson(cliPkgPath, pkg);
    process.stdout.write(
        `已写入 packages/cli/package.json -> "version": "${version}"\n`,
    );
}

function printNextSteps(tagName, willTag, version) {
    process.stdout.write('\n下一步：\n');
    process.stdout.write('  git push\n');
    if (willTag) {
        process.stdout.write(
            `  git push origin ${tagName}\n（推送上述 tag 触发仓库根 .github/workflows/build-docker-cli.yml）\n`,
        );
        process.stdout.write(
            `镜像: registry.cn-hangzhou.aliyuncs.com/winwin/tool:lightdash-cli-${version}\n`,
        );
        process.stdout.write(
            `GitHub Release: ${tagName} 挂 lightdash-cli-${version}.tgz（不标 Latest）\n`,
        );
        process.stdout.write(
            `CDN: https://img0.banmahui.cn/msy-x/cli/${version}/lightdash-cli-${version}.tgz\n`,
        );
    } else {
        process.stdout.write(
            '（未创建 tag；触发 CLI 镜像 / tgz CI 需推送 cli-v* tag）\n',
        );
    }
    process.stdout.write('主站请用: pnpm bump-version -- <version>\n');
    process.stdout.write('MCP 请用: pnpm bump-mcp -- <version>\n');
}

const flags = process.argv.slice(2).filter((x) => x.startsWith('--'));
const positionals = process.argv.slice(2).filter((x) => !x.startsWith('--'));
const rawVersion = positionals[0]?.trim();
const noCommit = flags.includes('--no-commit');
const noTag = flags.includes('--no-tag');

if (rawVersion === '-h' || flags.includes('--help') || flags.includes('-h')) {
    usage();
    process.exit(0);
}

if (positionals.length > 1) {
    process.stderr.write('多余的位置参数；版本最多一个\n');
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

const pkgVersion = readCliPackageVersion();
if (!pkgVersion) {
    process.stderr.write('无法读取 packages/cli/package.json 的 version\n');
    process.exit(1);
}

const version = normalizeVersion(rawVersion || pkgVersion);
const alreadyAtVersion = version === pkgVersion;
const tagName = `cli-v${version}`;
const willTag = !noCommit && !noTag;

if (!rawVersion) {
    process.stdout.write(
        `未指定版本，使用 packages/cli/package.json: ${pkgVersion}\n`,
    );
}

if (noCommit) {
    if (alreadyAtVersion) {
        process.stdout.write(
            `packages/cli/package.json 已是 ${version}，未改写。\n`,
        );
    } else {
        bumpCli(version);
    }
    process.stdout.write(
        '\n提示（--no-commit）：未执行 git；如需一条龙 commit + tag，请去掉 --no-commit 并在干净工作区重跑。\n',
    );
    process.exit(0);
}

ensureGitRepo();
ensureCleanExceptVersionFiles(alreadyAtVersion ? [] : [REL_CLI_PKG]);
if (willTag) {
    ensureTagAbsent(tagName);
}

if (alreadyAtVersion) {
    process.stdout.write(
        `packages/cli/package.json 已是 ${version}，跳过改写和 commit。\n`,
    );
} else {
    bumpCli(version);
    git(['add', REL_CLI_PKG]);
    git(['commit', '-m', `chore(release): 升级 CLI 至 ${version}`]);
}

if (willTag) {
    git(['tag', '-a', tagName, '-m', `lightdash-cli v${version}`]);
    process.stdout.write(`已创建 annotated tag: ${tagName}\n`);
} else if (alreadyAtVersion) {
    process.stdout.write(
        '（已跳过打 tag：使用了 --no-tag；文件已是目标版本，未创建 commit）\n',
    );
} else {
    process.stdout.write('（已跳过打 tag：使用了 --no-tag）\n');
}

printNextSteps(tagName, willTag, version);
