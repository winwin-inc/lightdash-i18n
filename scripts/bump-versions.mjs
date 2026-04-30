#!/usr/bin/env node
/**
 * 仓库根统一维护：MCP 的 package.json.version，以及 lightdash-skills 的 version.json（无 package.json）。
 *
 * 仓库根：`pnpm bump-mcp-skills -- x.y.z`（等价 `node … all x.y.z`）。
 * 只改一侧：`node scripts/bump-versions.mjs mcp|skills <version>`。
 *
 * 默认：`写文件` → `git add`（仅 version 文件）→ `git commit` → `git tag -a mcp-v<ver>`（skills 子命令不打 tag）。
 * 开关：`--no-commit` 仅写文件（不校验工作区、不打 commit/tag）；`--no-tag` 仅 commit，不打 tag。
 * 本地完成不 push；推送 tag 后触发 CI [.github/workflows/build-docker-mcp.yml](...)。
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '..');
const mcpPkgPath = path.join(repoRoot, 'packages', 'lightdash-mcp', 'package.json');
const skillsVersionJsonPath = path.join(
    repoRoot,
    'packages',
    'lightdash-skills',
    'version.json',
);

/** 仓库根相对路径（正斜杠），供 git 状态校验 */
const REL_MCP_PKG = 'packages/lightdash-mcp/package.json';
const REL_SKILLS_VER = 'packages/lightdash-skills/version.json';

const SEMVER_RE = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;

function usage() {
    process.stderr.write(`用法（一套发版优先用 all）:
  node scripts/bump-versions.mjs all <version> [--no-commit] [--no-tag]
  node scripts/bump-versions.mjs mcp <version> [--no-commit] [--no-tag]
  node scripts/bump-versions.mjs skills <version> [--no-commit]

示例:
  pnpm bump-mcp-skills -- 0.1.1
  node scripts/bump-versions.mjs mcp 0.0.3
  node scripts/bump-versions.mjs skills 0.1.1
  node scripts/bump-versions.mjs all 0.1.5 --no-commit

默认行为：写文件 -> 仅 add version 文件 -> git commit -> 打 mcp-v<ver> annotated tag（skills 不打 tag）。
开关：--no-commit 仅写文件（等价旧脚本）；--no-tag commit 后不打 tag。
本地不 push；确认无误后：git push && git push origin mcp-v<版本号> 触发 MCP Docker CI。
`);
}

function normalizeVersion(raw) {
    const v = raw.replace(/^v/i, '');
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

function bumpSkills(version) {
    const updatedAt = new Date().toISOString().split('T')[0];
    writeJson(skillsVersionJsonPath, { version, updatedAt });
    process.stdout.write(
        `已写入 packages/lightdash-skills/version.json -> "${version}"（updatedAt: ${updatedAt}）\n`,
    );
}

const cmd = process.argv[2]?.trim();
const arg = process.argv[3]?.trim();
const extra = process.argv.slice(4);
const noCommit = extra.includes('--no-commit');
const noTag = extra.includes('--no-tag');

if (!cmd || cmd === '-h' || cmd === '--help') {
    usage();
    process.exit(cmd ? 0 : 1);
}

if (!arg || extra.some((x) => !x.startsWith('--'))) {
    if (!arg) {
        process.stderr.write(`缺少版本参数（命令: ${cmd}）\n`);
    } else if (extra.some((x) => !x.startsWith('--'))) {
        process.stderr.write(
            `多余的位置参数；版本应为第三个参数，开关仅支持 --no-commit / --no-tag\n`,
        );
    }
    usage();
    process.exit(1);
}

const version = normalizeVersion(arg);

function commitMessageFor(command) {
    if (command === 'all') {
        return `chore(release): 升级 lightdash-mcp 与 skills 至 ${version}`;
    }
    if (command === 'mcp') {
        return `chore(release): 升级 lightdash-mcp 至 ${version}`;
    }
    return `chore(release): 升级 lightdash-skills 至 ${version}`;
}

function runGitRelease(pathsToAdd, command) {
    const tagName = `mcp-v${version}`;
    const willTag =
        (command === 'mcp' || command === 'all') && !noTag && !noCommit;

    if (noCommit) {
        if (command === 'mcp') {
            bumpMcp(version);
        } else if (command === 'skills') {
            bumpSkills(version);
        } else {
            bumpMcp(version);
            bumpSkills(version);
        }
        process.stdout.write(
            `\n提示（--no-commit）：未执行 git；如需一条龙 commit + tag，请去掉 --no-commit 并在干净工作区重跑。\n`,
        );
        return;
    }

    ensureGitRepo();
    ensureCleanExceptVersionFiles(pathsToAdd);
    if (willTag) {
        ensureTagAbsent(tagName);
    }

    if (command === 'mcp') {
        bumpMcp(version);
    } else if (command === 'skills') {
        bumpSkills(version);
    } else {
        bumpMcp(version);
        bumpSkills(version);
    }

    for (const rel of pathsToAdd) {
        git(['add', rel]);
    }
    git(['commit', '-m', commitMessageFor(command)]);

    if (willTag) {
        git([
            'tag',
            '-a',
            tagName,
            '-m',
            `lightdash-mcp v${version}`,
        ]);
        process.stdout.write(`已创建 annotated tag: ${tagName}\n`);
    } else if (
        (command === 'mcp' || command === 'all') &&
        noTag &&
        !noCommit
    ) {
        process.stdout.write('（已跳过打 tag：使用了 --no-tag）\n');
    }

    process.stdout.write('\n下一步：\n');
    process.stdout.write('  git push\n');
    if (command === 'skills') {
        process.stdout.write(
            '（skills-only：未创建 mcp-v* tag；若需触发 MCP 镜像 CI，请用 all/mcp 发版或手动打 tag 再推送）\n',
        );
    } else if (willTag) {
        process.stdout.write(
            `  git push origin ${tagName}\n（推送上述 tag 触发仓库根 .github/workflows/build-docker-mcp.yml）\n`,
        );
    } else {
        process.stdout.write(
            '（未创建 tag；触发 MCP 镜像 CI 需推送 mcp-v* tag）\n',
        );
    }
}

if (cmd === 'mcp') {
    runGitRelease([REL_MCP_PKG], 'mcp');
} else if (cmd === 'skills') {
    if (noTag) {
        process.stderr.write('skills 命令不支持 --no-tag（本来就不打 tag）\n');
        usage();
        process.exit(1);
    }
    runGitRelease([REL_SKILLS_VER], 'skills');
} else if (cmd === 'all') {
    runGitRelease([REL_MCP_PKG, REL_SKILLS_VER], 'all');
} else {
    process.stderr.write(`未知命令: ${cmd}\n`);
    usage();
    process.exit(1);
}
