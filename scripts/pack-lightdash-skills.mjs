#!/usr/bin/env node
/**
 * 将 packages/lightdash-skills 按白名单复制到 dist，并打 zip（Claude Code 对外分发用）。
 * 不包含：MAINTAINERS.md、.mcp.json、.env*、OpenClaw 等第二轨产物。
 *
 * 仓库根：pnpm pack-lightdash-skills
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '..');
const skillsRoot = path.join(repoRoot, 'packages', 'lightdash-skills');
const distWork = path.join(repoRoot, 'dist', 'lightdash-skills-pack', 'stage');
const archiveRootName = 'lightdash-skills';

/** 相对 packages/lightdash-skills 的文件路径（白名单） */
const FILES = [
    'version.json',
    'README.md',
    'CLAUDE.md',
    '.mcp.json.example',
    '.claude/settings.json',
    'lightdash-insight-router/SKILL.md',
    'lightdash-insight-router/ROUTER-SOP.md',
    'lightdash-metric-query/SKILL.md',
    'lightdash-metric-query/QUERY-CHECKLIST.md',
    'lightdash-chart-semantics/SKILL.md',
];

function mkdirp(dir) {
    fs.mkdirSync(dir, { recursive: true });
}

function copyFile(relFrom, relTo) {
    const from = path.join(skillsRoot, relFrom);
    const to = path.join(distWork, relTo);
    if (!fs.existsSync(from)) {
        throw new Error(`Missing source file: ${relFrom}`);
    }
    mkdirp(path.dirname(to));
    fs.copyFileSync(from, to);
}

function listMdInResources() {
    const dir = path.join(
        skillsRoot,
        'lightdash-chart-semantics',
        'resources',
    );
    if (!fs.existsSync(dir)) return [];
    return fs
        .readdirSync(dir, { withFileTypes: true })
        .filter((e) => e.isFile() && e.name.endsWith('.md'))
        .map((e) => e.name);
}

async function createZip(stagingDir, zipPath) {
    const archiver = (await import('archiver')).default;
    return new Promise((resolve, reject) => {
        mkdirp(path.dirname(zipPath));
        const output = fs.createWriteStream(zipPath);
        const archive = archiver('zip', { zlib: { level: 9 } });
        output.on('close', () => resolve(archive.pointer()));
        archive.on('error', reject);
        archive.pipe(output);
        archive.directory(stagingDir, archiveRootName);
        archive.finalize();
    });
}

async function main() {
    const versionJson = JSON.parse(
        fs.readFileSync(path.join(skillsRoot, 'version.json'), 'utf8'),
    );
    const version = versionJson.version;
    if (!version || typeof version !== 'string') {
        throw new Error('packages/lightdash-skills/version.json 缺少有效 version');
    }

    fs.rmSync(path.join(repoRoot, 'dist', 'lightdash-skills-pack'), {
        recursive: true,
        force: true,
    });
    mkdirp(distWork);

    for (const rel of FILES) {
        copyFile(rel, rel);
    }

    const resourceMds = listMdInResources();
    for (const name of resourceMds) {
        const rel = path.join('lightdash-chart-semantics', 'resources', name);
        copyFile(rel, rel);
    }

    const zipPath = path.join(
        repoRoot,
        'dist',
        `${archiveRootName}-v${version}.zip`,
    );
    const bytes = await createZip(distWork, zipPath);
    const kb = (bytes / 1024).toFixed(1);
    // eslint-disable-next-line no-console -- CLI
    console.log(`Wrote ${path.relative(repoRoot, zipPath)} (${kb} KB)`);
    // eslint-disable-next-line no-console -- CLI
    console.log(
        `Staging (可删): ${path.relative(repoRoot, distWork)} — 解压 zip 根目录为 ${archiveRootName}/`,
    );
}

main().catch((err) => {
    // eslint-disable-next-line no-console -- CLI
    console.error(err);
    process.exit(1);
});
