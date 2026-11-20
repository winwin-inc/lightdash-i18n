#!/usr/bin/env node
/**
 * bump-msyx：更新 packages/msy-x-cli 版本并打 msyx-v* tag（独立于主仓版本）。
 *
 * 用法：
 *   pnpm bump-msyx -- 0.1.0        # 写版本 → commit → 打 tag
 *   pnpm bump-msyx                  # 用当前 version（已是则只打 tag）
 *   node scripts/bump-msy-x-cli-version.mjs 0.2.0 --no-commit
 *
 * 开关：--no-commit 仅写文件；--no-tag commit 后不打 tag；--dry-run 只打印、不写盘、不 git。
 * 本地不 push；推送 tag 触发 .github/workflows/release-msy-x-cli.yml
 *   - GitHub Release msyx-vX.Y.Z 挂 msy-x-cli-X.Y.Z.tgz（不标 Latest）
 *   - OSS/CDN：msy-x/cli/msy-x-cli/X.Y.Z/msy-x-cli-X.Y.Z.tgz
 * 若 tag 已存在（旧 tag 没改 version），先删再重打：
 *   git tag -d msyx-v<ver>
 *   git push origin :refs/tags/msyx-v<ver>
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const REL_PKG = 'packages/msy-x-cli/package.json';
const REL_TS = 'packages/msy-x-cli/src/lib/version.ts';
const SEMVER_RE = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;

const rawArgs = process.argv.slice(2);
const unknown = rawArgs.filter((a) => a.startsWith('--') && !['--no-commit', '--no-tag', '--dry-run'].includes(a));
const positionals = rawArgs.filter((a) => !a.startsWith('--'));
if (unknown.length > 0 || positionals.length > 1) {
    process.stderr.write(`未知开关或多余参数: ${unknown.concat(positionals.slice(1)).join(' ')}\n用法: pnpm bump-msyx -- [version] [--no-commit] [--no-tag] [--dry-run]\n`);
    process.exit(1);
}

const pkg = JSON.parse(fs.readFileSync(path.join(root, REL_PKG), 'utf8'));
const raw = positionals[0]?.trim();
const version = (raw ?? pkg.version).replace(/^msyx-v/i, '').replace(/^v/i, '');
if (!SEMVER_RE.test(version)) {
    process.stderr.write(`非法版本号: ${raw ?? version}（需形如 0.1.0 或 1.2.3-rc.1）\n`);
    process.exit(1);
}

const already = version === pkg.version;
const tagName = `msyx-v${version}`;
const willTag = !rawArgs.includes('--no-commit') && !rawArgs.includes('--no-tag');

if (rawArgs.includes('--dry-run')) {
    process.stdout.write(already
        ? `[dry-run] packages/msy-x-cli 已是 ${version}，跳过写文件。\n`
        : `[dry-run] 将写 ${REL_PKG} version -> ${version}，并同步 ${REL_TS} 的 CLI_VERSION。\n`);
    process.stdout.write(`[dry-run] commit: chore(msy-x-cli): 发布 ${version}\n`);
    if (willTag) process.stdout.write(`[dry-run] tag: ${tagName}\n`);
    process.exit(0);
}

const git = (gitArgs) => {
    const r = spawnSync('git', gitArgs, { stdio: 'inherit', cwd: root });
    if (r.status !== 0) process.exit(r.status ?? 1);
};

if (willTag) {
    const probe = spawnSync('git', ['rev-parse', '-q', '--verify', `refs/tags/${tagName}`], { stdio: 'ignore', cwd: root });
    if (probe.status === 0) {
        process.stderr.write(`tag ${tagName} 已存在；先删除再重打：\n  git tag -d ${tagName}\n  git push origin :refs/tags/${tagName}\n`);
        process.exit(1);
    }
}

if (!already) {
    pkg.version = version;
    fs.writeFileSync(path.join(root, REL_PKG), `${JSON.stringify(pkg, null, 4)}\n`);
    const ts = fs.readFileSync(path.join(root, REL_TS), 'utf8');
    if (!/export const CLI_VERSION = '[^']*';/.test(ts)) {
        process.stderr.write(`未在 ${REL_TS} 找到 CLI_VERSION 定义，请手工同步后重试\n`);
        process.exit(1);
    }
    fs.writeFileSync(path.join(root, REL_TS), ts.replace(/export const CLI_VERSION = '[^']*';/, `export const CLI_VERSION = '${version}';`));
    process.stdout.write(`已写入 ${REL_PKG} 与 ${REL_TS} -> ${version}\n`);
} else {
    process.stdout.write(`packages/msy-x-cli 已是 ${version}，跳过写文件。\n`);
}

if (rawArgs.includes('--no-commit')) {
    process.stdout.write('（--no-commit：未执行 git；如需 commit + tag，在干净工作区去掉该开关重跑。）\n');
    process.exit(0);
}

if (!already) {
    git(['add', REL_PKG, REL_TS]);
    git(['commit', '-m', `chore(msy-x-cli): 发布 ${version}`, '--', REL_PKG, REL_TS]);
}

if (willTag) {
    git(['tag', '-a', tagName, '-m', `msy-x-cli v${version}`]);
    process.stdout.write(`已创建 annotated tag: ${tagName}\n`);
}

process.stdout.write(`\n下一步：git push && git push origin ${tagName}\n（推送 tag 触发 .github/workflows/release-msy-x-cli.yml：GitHub Release + OSS/CDN + 豆包 cli.json 门禁）\n`);
