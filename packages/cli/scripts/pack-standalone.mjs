#!/usr/bin/env node
/**
 * 把 ncc bundle 打成无 workspace 依赖的 npm tgz。
 * 版本只读 packages/cli/package.json，与 lightdash --version 同源。
 *
 * 用法（需先 build common / warehouses / cli）:
 *   pnpm -F cli pack:standalone
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cliRoot = path.join(__dirname, '..');
const bundleDir = path.join(cliRoot, 'bundle');
const releaseDir = path.join(cliRoot, 'release');
const cliPkgPath = path.join(cliRoot, 'package.json');

const cliPkg = JSON.parse(fs.readFileSync(cliPkgPath, 'utf8'));
const version = typeof cliPkg.version === 'string' ? cliPkg.version : null;
if (!version) {
    process.stderr.write('packages/cli/package.json 缺少 version\n');
    process.exit(1);
}

const bundleEntry = path.join(bundleDir, 'index.js');
if (!fs.existsSync(bundleEntry)) {
    process.stderr.write('缺少 bundle/index.js。请先运行 pnpm -F cli bundle\n');
    process.exit(1);
}

fs.rmSync(releaseDir, { recursive: true, force: true });
fs.mkdirSync(releaseDir, { recursive: true });

const destIndex = path.join(releaseDir, 'index.js');
let indexSource = fs.readFileSync(bundleEntry, 'utf8');
if (!indexSource.startsWith('#!')) {
    indexSource = `#!/usr/bin/env node\n${indexSource}`;
}
fs.writeFileSync(destIndex, indexSource);
fs.chmodSync(destIndex, 0o755);

const extraNames = fs
    .readdirSync(bundleDir)
    .filter((name) => /\.(crt|pem|node)$/i.test(name));
extraNames.forEach((name) => {
    fs.copyFileSync(path.join(bundleDir, name), path.join(releaseDir, name));
});

const standalonePkg = {
    name: '@lightdash/cli',
    version,
    description: 'Lightdash CLI (standalone, no workspace dependencies)',
    license: cliPkg.license || 'MIT',
    bin: {
        lightdash: 'index.js',
    },
    files: ['index.js', '*.crt', '*.pem', '*.node'],
};

fs.writeFileSync(
    path.join(releaseDir, 'package.json'),
    `${JSON.stringify(standalonePkg, null, 4)}\n`,
);

const pack = spawnSync('npm', ['pack', '--pack-destination', releaseDir], {
    cwd: releaseDir,
    stdio: 'inherit',
    shell: process.platform === 'win32',
});
if (pack.status !== 0) {
    process.exit(pack.status ?? 1);
}

const tgzName = `lightdash-cli-${version}.tgz`;
const tgzPath = path.join(releaseDir, tgzName);
if (!fs.existsSync(tgzPath)) {
    process.stderr.write(`npm pack 未生成预期文件: ${tgzName}\n`);
    process.exit(1);
}

process.stdout.write(`已生成 ${tgzPath}\n`);
