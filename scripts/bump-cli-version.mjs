#!/usr/bin/env node
/**
 * 为 Jenkins CLI 工具镜像打 annotated tag：cli-vX.Y.Z
 *
 * CLI 与主仓共用 workspace version（由 pnpm bump-version 改写 packages/cli/package.json）。
 * 本脚本不改文件，只在当前 HEAD 打 tag；推送后触发
 * .github/workflows/build-docker-cli.yml → ACR winwin/tool:lightdash-cli-X.Y.Z
 *
 * 用法：
 *   pnpm bump-cli -- 0.2107.8
 *   pnpm bump-cli                 # 使用 packages/cli/package.json 的当前 version
 *   node scripts/bump-cli-version.mjs 0.2107.8
 *
 * 本地不 push；确认无误后：git push origin cli-v<版本号>
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '..');
const cliPkgPath = path.join(repoRoot, 'packages', 'cli', 'package.json');

const SEMVER_RE = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;

function usage() {
    const current = readCliPackageVersion();
    process.stderr.write(`用法:
  node scripts/bump-cli-version.mjs [version]
  pnpm bump-cli -- <version>
  pnpm bump-cli

示例:
  pnpm bump-cli -- 0.2107.8
  pnpm bump-cli

省略 version 时使用 packages/cli/package.json（当前: ${current ?? '无法读取'}）。
本脚本不改 package.json（CLI 版本由 pnpm bump-version 维护）。
默认：校验干净工作区 → 打 annotated tag cli-v<ver>。
本地不 push；确认无误后：git push origin cli-v<版本号>
触发 CI：.github/workflows/build-docker-cli.yml
镜像：registry.cn-hangzhou.aliyuncs.com/winwin/tool:lightdash-cli-X.Y.Z
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
            `非法版本号: ${raw}（需形如 0.2107.8 或 1.2.3-rc.1）\n`,
        );
        process.exit(1);
    }
    return v;
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

function ensureCleanWorkingTree() {
    const r = spawnSync('git', ['status', '--porcelain'], {
        stdio: ['ignore', 'pipe', 'pipe'],
        cwd: repoRoot,
        encoding: 'utf8',
    });
    if (r.status !== 0) {
        process.stderr.write(r.stderr ?? 'git status 失败\n');
        process.exit(r.status ?? 1);
    }
    const dirty = (r.stdout ?? '').trim();
    if (dirty) {
        process.stderr.write(
            '工作区有未提交改动。请先 commit 或 stash 后再打 cli-v* tag。\n',
        );
        process.exit(1);
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

const flags = process.argv.slice(2).filter((x) => x.startsWith('--'));
const positionals = process.argv.slice(2).filter((x) => !x.startsWith('--'));
const rawVersion = positionals[0]?.trim();

if (rawVersion === '-h' || flags.includes('--help') || flags.includes('-h')) {
    usage();
    process.exit(0);
}

if (positionals.length > 1) {
    process.stderr.write('多余的位置参数；版本最多一个\n');
    usage();
    process.exit(1);
}

if (flags.length > 0) {
    process.stderr.write(`未知开关: ${flags.join(' ')}\n`);
    usage();
    process.exit(1);
}

const pkgVersion = readCliPackageVersion();
if (!pkgVersion) {
    process.stderr.write('无法读取 packages/cli/package.json 的 version\n');
    process.exit(1);
}

const version = normalizeVersion(rawVersion || pkgVersion);
const tagName = `cli-v${version}`;

if (!rawVersion) {
    process.stdout.write(
        `未指定版本，使用 packages/cli/package.json: ${pkgVersion}\n`,
    );
} else if (version !== pkgVersion) {
    process.stdout.write(
        `注意：tag 版本 ${version} 与 packages/cli/package.json（${pkgVersion}）不一致。\n镜像 tag 用 ${version}；容器内 lightdash --version 仍显示 ${pkgVersion}。\n如需对齐，先 pnpm bump-version -- ${version} 再打 cli tag。\n\n`,
    );
}

ensureGitRepo();
ensureCleanWorkingTree();
ensureTagAbsent(tagName);

git(['tag', '-a', tagName, '-m', `lightdash-cli v${version}`]);
process.stdout.write(`已创建 annotated tag: ${tagName}\n`);
process.stdout.write('\n下一步：\n');
process.stdout.write(`  git push origin ${tagName}\n`);
process.stdout.write(
    '（推送上述 tag 触发仓库根 .github/workflows/build-docker-cli.yml）\n',
);
process.stdout.write(
    `镜像: registry.cn-hangzhou.aliyuncs.com/winwin/tool:lightdash-cli-${version}\n`,
);
process.stdout.write('主站请用: pnpm bump-version -- <version>\n');
process.stdout.write('MCP 请用: pnpm bump-mcp -- <version>\n');
