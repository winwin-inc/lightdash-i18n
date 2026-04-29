#!/usr/bin/env node
/**
 * 仓库根统一维护：MCP 的 package.json.version，以及 lightdash-skills 的 version.json（无 package.json）。
 *
 * 仓库根：`pnpm bump-mcp-skills -- x.y.z`（等价 `node … all x.y.z`）。
 * 只改一侧：`node scripts/bump-versions.mjs mcp|skills <version>`。
 */
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

const SEMVER_RE = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;

function usage() {
    process.stderr.write(`用法（一套发版优先用 all）:
  node scripts/bump-versions.mjs all <version>       # 推荐：MCP package.json + skills version.json
  node scripts/bump-versions.mjs mcp <version>
  node scripts/bump-versions.mjs skills <version>

示例:
  pnpm bump-mcp-skills -- 0.1.1
  node scripts/bump-versions.mjs mcp 0.0.3
  node scripts/bump-versions.mjs skills 0.1.1
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

if (!cmd || cmd === '-h' || cmd === '--help') {
    usage();
    process.exit(cmd ? 0 : 1);
}

if (!arg) {
    process.stderr.write(`缺少版本参数（命令: ${cmd}）\n`);
    usage();
    process.exit(1);
}

const version = normalizeVersion(arg);

if (cmd === 'mcp') {
    bumpMcp(version);
    process.stdout.write(
        `提示: git add packages/lightdash-mcp/package.json && git commit … && git tag "mcp-v${version}"\n`,
    );
} else if (cmd === 'skills') {
    bumpSkills(version);
    process.stdout.write(
        `提示: git add packages/lightdash-skills/version.json && git commit …\n`,
    );
} else if (cmd === 'all') {
    bumpMcp(version);
    bumpSkills(version);
    process.stdout.write(
        `提示: git add packages/lightdash-mcp/package.json packages/lightdash-skills/version.json && git commit …\n`,
    );
} else {
    process.stderr.write(`未知命令: ${cmd}\n`);
    usage();
    process.exit(1);
}
