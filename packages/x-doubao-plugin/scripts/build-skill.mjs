#!/usr/bin/env node
/**
 * 打「技能包」ZIP —— 用于开放平台「技能 → 上传技能」入口。
 *
 *   node scripts/build-skill.mjs
 *
 * 与插件包的区别（这是最常见的提交失败原因）：
 *   插件包 ZIP 根：plugin.json + mcp.json + skills/
 *   技能包 ZIP 根：SKILL.md（本项目取 plugin/skills/<技能名>/ 作为根）
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { writeZip } from './zip.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SKILL_NAME = process.env.SKILL_NAME ?? 'brandct-x-insight';
const SRC =
    process.env.SKILL_SRC ?? path.join(HERE, '..', 'plugin', 'skills', SKILL_NAME);
const OUT =
    process.argv[2] ?? path.join(HERE, '..', 'dist', `${SKILL_NAME}.zip`);

const result = await writeZip(SRC, OUT, 'SKILL.md');

console.log(`已生成 ${path.relative(process.cwd(), OUT)}`);
console.log(
    `  条目 ${result.entries} 个，原始 ${(result.rawBytes / 1024).toFixed(1)}KB，` +
        `压缩后 ${(result.zipBytes / 1024).toFixed(1)}KB`,
);
console.log(`  ZIP 根文件：${result.rootFiles.join(', ')}`);
console.log('  → 可直接在「技能 → 上传技能」选择该 ZIP（或直接拖入该技能文件夹）');
