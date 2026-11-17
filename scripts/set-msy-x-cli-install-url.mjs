#!/usr/bin/env node
/**
 * set-msyx-url：把豆包 cli.json 的 connectors["msy-x"].install.default
 * 指到公网 tgz 安装地址（发布流水线的配套工具）。
 *
 * 用法：
 *   node scripts/set-msy-x-cli-install-url.mjs <https tgz url> [--file <path>] [--dry-run]
 *   pnpm set-msyx-url -- <url>
 *
 * 校验：必须以 https:// 开头、以 .tgz 结尾、不得含占位域名 static.example.com。
 * 只替换 connectors["msy-x"].install.default 数组，其它字段与键序保持
 * （2 空格缩进 + 结尾换行）。--file 便于对临时副本测试；--dry-run 只打印不写盘。
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_FILE = 'packages/x-doubao-plugin/plugin/com.doubao/cli.json';

const fail = (message) => {
    process.stderr.write(`set-msyx-url: ${message}\n`);
    process.exit(1);
};

const rawArgs = process.argv.slice(2);
let url;
let file = null;
let dryRun = false;
for (let i = 0; i < rawArgs.length; i += 1) {
    const arg = rawArgs[i];
    if (arg === '--file') {
        file = rawArgs[i + 1];
        i += 1;
        if (!file || file.startsWith('--')) fail('--file 需要一个路径参数');
    } else if (arg === '--dry-run') {
        dryRun = true;
    } else if (arg.startsWith('--')) {
        fail(`未知开关: ${arg}\n用法: pnpm set-msyx-url -- <https tgz url> [--file <path>] [--dry-run]`);
    } else if (url === undefined) {
        url = arg;
    } else {
        fail('位置参数最多一个（安装 URL）');
    }
}
if (!url) fail('缺少安装 URL。\n用法: pnpm set-msyx-url -- <https tgz url> [--file <path>] [--dry-run]');

const problems = [];
if (!url.startsWith('https://')) problems.push('必须以 https:// 开头');
if (!url.endsWith('.tgz')) problems.push('必须以 .tgz 结尾');
if (url.includes('static.example.com')) problems.push('不得指向占位域名 static.example.com');
if (problems.length > 0) fail(`非法安装 URL: ${url}\n  - ${problems.join('\n  - ')}`);

const filePath = path.resolve(root, file ?? DEFAULT_FILE);
let cli;
try {
    cli = JSON.parse(fs.readFileSync(filePath, 'utf8'));
} catch (error) {
    fail(`无法读取/解析 ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
}
const install = cli?.connectors?.['msy-x']?.install;
if (!Array.isArray(install?.default)) {
    fail(`${file ?? DEFAULT_FILE} 缺少 connectors["msy-x"].install.default 数组`);
}

const before = install.default;
install.default = [`npm install -g ${url}`];
if (dryRun) {
    process.stdout.write(`[dry-run] 目标文件: ${filePath}（未写盘）\n`);
    process.stdout.write(`[dry-run] 改前 install.default:\n${JSON.stringify(before, null, 2)}\n`);
    process.stdout.write(`[dry-run] 改后 install.default:\n${JSON.stringify(install.default, null, 2)}\n`);
} else {
    fs.writeFileSync(filePath, `${JSON.stringify(cli, null, 2)}\n`);
    process.stdout.write(`已写入 ${filePath}\n`);
    process.stdout.write(`install.default -> ${JSON.stringify(install.default)}\n`);
}
