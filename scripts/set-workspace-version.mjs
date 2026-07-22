#!/usr/bin/env node
/**
 * 设置 monorepo 根与 workspace 的 package.json version，跳过 packages/lightdash-*（单独维护）。
 *
 * 用法：
 *   pnpm set-version -- 0.2105.4
 *   node scripts/set-workspace-version.mjs 0.2105.4
 *
 * 行为对齐：
 *   npm version <ver> --workspaces --include-workspace-root --allow-same-version --no-git-tag-version
 * 但不改动 packages/lightdash-*（mcp / charts-viewer / skills 等）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '..');

const SEMVER_RE = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;

function usage() {
    process.stderr.write(`用法:
  node scripts/set-workspace-version.mjs <version>
  pnpm set-version -- <version>

示例:
  pnpm set-version -- 0.2105.4

跳过目录: packages/lightdash-*（单独发版，请用 pnpm bump-mcp-skills）
不打 git tag / 不 commit。
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

const rawVersion = process.argv[2]?.trim();
if (!rawVersion || rawVersion === '-h' || rawVersion === '--help') {
    usage();
    process.exit(rawVersion ? 0 : 1);
}

if (process.argv.length > 3) {
    process.stderr.write('只接受一个版本参数；多余参数请去掉。\n');
    usage();
    process.exit(1);
}

const version = normalizeVersion(rawVersion);
const updated = [];
const skipped = [];
const unchanged = [];

for (const pkgPath of collectPackageJsonPaths()) {
    const pkgDir = path.dirname(pkgPath);
    const rel = toPosix(path.relative(repoRoot, pkgPath));

    if (pkgDir !== repoRoot && isSkippedPackageDir(pkgDir)) {
        skipped.push(rel);
        continue;
    }

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
process.stdout.write(
    '\n完成（未 commit / 未打 tag）。MCP/skills 请用: pnpm bump-mcp-skills -- <version>\n',
);
