#!/usr/bin/env node
/**
 * 打「插件包」ZIP —— 用于开放平台「插件 → 创建插件」入口。
 *
 *   node scripts/build-plugin.mjs
 *
 * 关键：ZIP 根目录必须是插件根（plugin.json 在最外层）。
 * 多套一层 x-doubao-plugin/ 或 plugin/ 是最高频的提交失败原因。
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { writeZip } from './zip.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = process.env.PLUGIN_SRC ?? path.join(HERE, '..', 'plugin');
const OUT =
    process.argv[2] ?? path.join(HERE, '..', 'dist', 'x-platform-assistant.zip');

const result = await writeZip(SRC, OUT, 'plugin.json');

console.log(`已生成 ${path.relative(process.cwd(), OUT)}`);
console.log(
    `  条目 ${result.entries} 个，原始 ${(result.rawBytes / 1024).toFixed(1)}KB，` +
        `压缩后 ${(result.zipBytes / 1024).toFixed(1)}KB`,
);
console.log(`  ZIP 根文件：${result.rootFiles.join(', ')}`);
console.log('  → 可直接在「插件 → 创建插件」上传该 ZIP');
