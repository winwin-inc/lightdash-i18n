#!/usr/bin/env node
/**
 * pack-cli.mjs — 把 msy-x-cli 打成可安装的 npm tgz 并生成校验和。
 *
 * 用法（= `pnpm pack:tgz` 的后半步，需先 `pnpm build`）：
 *   node scripts/pack-cli.mjs
 *
 * 行为（docs/cli/msy-x-cli-design.md §9.2 / dev-plan §P4-1）：
 *   1. 前置检查：dist/index.js 必须存在，否则提示先 `pnpm build`；
 *   2. 在包目录执行 `npm pack --silent`（本地打包，不发网络请求）；
 *   3. 把产出的 tgz 移到 `dist-msy-x/`（不存在则创建，并清掉同名旧产物）；
 *   4. 计算 sha256，写同级 `<tgz>.sha256` 文件（格式 `<hex>  <filename>`，
 *      与 `sha256sum` 一致，可在 dist-msy-x 内 `sha256sum -c` 校验）；
 *   5. stdout 只输出两行机器可读信息：`tgz=<abs path>` 与 `sha256=<hex>`；
 *      任何失败写 stderr 并以非 0 退出。
 *
 * 纯 Node 实现，无第三方依赖；npm 需在 PATH 中。
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
    existsSync,
    mkdirSync,
    readdirSync,
    readFileSync,
    renameSync,
    rmSync,
    writeFileSync,
} from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const fail = (message) => {
    process.stderr.write(`pack-cli: ${message}\n`);
    process.exit(1);
};

const pkgRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(pkgRoot, 'dist-msy-x');
const distEntry = path.join(pkgRoot, 'dist', 'index.js');

// 1) 前置检查：没构建就明确报错，不打半截包
if (!existsSync(distEntry)) {
    fail('dist/index.js 不存在：请先执行 `pnpm build`（或直接 `pnpm pack:tgz`）再打包');
}

// 2) npm pack（本地 tar 打包；产出文件名走 stdout，警告已被 --silent 抑制）
const npmBin = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const pack = spawnSync(npmBin, ['pack', '--silent'], {
    cwd: pkgRoot,
    encoding: 'utf8',
});
if (pack.error) {
    fail(`无法执行 npm（${npmBin} pack）：${pack.error.message}`);
}
if (pack.status !== 0) {
    const detail = (pack.stderr ?? '').trim() || '(无 stderr)';
    fail(`npm pack 失败（exit ${pack.status}）：${detail}`);
}

const tgzName = (pack.stdout ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.endsWith('.tgz'))
    .pop();
if (!tgzName) {
    fail(`npm pack 未返回 .tgz 文件名，原始输出：${JSON.stringify(pack.stdout ?? '')}`);
}
if (tgzName.includes('/') || tgzName.includes('\\')) {
    fail(`npm pack 返回了带路径的文件名 ${tgzName}，与预期不符`);
}
const srcTgz = path.join(pkgRoot, tgzName);
if (!existsSync(srcTgz)) {
    fail(`npm pack 声称产出 ${tgzName}，但文件不存在`);
}

// 3) 移入 dist-msy-x/；先清掉本包旧 tgz/.sha256，保证目录只反映本次打包
try {
    mkdirSync(outDir, { recursive: true });
    for (const name of readdirSync(outDir)) {
        if (/^msy-x-cli-.*\.tgz(\.sha256)?$/.test(name)) {
            rmSync(path.join(outDir, name), { force: true });
        }
    }
    renameSync(srcTgz, path.join(outDir, tgzName));
} catch (error) {
    rmSync(srcTgz, { force: true });
    fail(`移动产物到 dist-msy-x/ 失败：${error instanceof Error ? error.message : String(error)}`);
}
const destTgz = path.join(outDir, tgzName);

// 4) sha256 校验和（`<hex>  <filename>`，两个空格，兼容 sha256sum -c）
let hex;
try {
    hex = createHash('sha256').update(readFileSync(destTgz)).digest('hex');
    writeFileSync(`${destTgz}.sha256`, `${hex}  ${tgzName}\n`);
} catch (error) {
    fail(`生成 sha256 失败：${error instanceof Error ? error.message : String(error)}`);
}

// 5) 机器可读输出（stdout 仅此两行）
process.stdout.write(`tgz=${path.resolve(destTgz)}\nsha256=${hex}\n`);
