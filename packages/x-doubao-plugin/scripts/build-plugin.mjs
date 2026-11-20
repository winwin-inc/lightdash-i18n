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

/**
 * 从 ZIP 尾部读中央目录，返回全部条目名（零依赖，只解析文件名，不校验内容）。
 */
function readZipEntryNames(buf) {
    // 从尾部找 EOCD（0x06054b50）；注释最长 65535 字节
    let eocd = -1;
    for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65535); i--) {
        if (buf.readUInt32LE(i) === 0x06054b50) {
            eocd = i;
            break;
        }
    }
    if (eocd < 0) throw new Error('ZIP 缺少 End Of Central Directory，文件损坏');
    const count = buf.readUInt16LE(eocd + 10);
    let offset = buf.readUInt32LE(eocd + 16);
    const names = [];
    for (let i = 0; i < count; i++) {
        if (buf.readUInt32LE(offset) !== 0x02014b50) {
            throw new Error(`ZIP 中央目录第 ${i + 1} 条签名异常`);
        }
        const nameLen = buf.readUInt16LE(offset + 28);
        names.push(buf.toString('utf8', offset + 46, offset + 46 + nameLen));
        offset += 46 + nameLen + buf.readUInt16LE(offset + 30) + buf.readUInt16LE(offset + 32);
    }
    return names;
}

const result = await writeZip(SRC, OUT, 'plugin.json');

// 断言：writeZip 按 SRC 递归打包，这里回读 ZIP 中央目录，
// 确认源目录里的清单 / 连接器声明 / 技能入口都进了 ZIP（无遗漏、无换层）。
const { stat: statSrc, readFile: readOut } = await import('node:fs/promises');
const zipBuf = await readOut(OUT);
const entries = readZipEntryNames(zipBuf);
const optionalBySource = [
    ['mcp.json', ['mcp.json']],
    ['com.doubao/cli.json', ['com.doubao/cli.json', 'skills/brandct-x-insight/references/cli.md']],
    ['com.doubao/auth/x.json', ['com.doubao/auth/x.json']],
];
const required = [
    'plugin.json',
    'skills/brandct-x-insight/SKILL.md',
    'skills/brandct-x-insight/references/fields.md',
];
for (const [srcRel, zipRels] of optionalBySource) {
    let present = false;
    try {
        present = (await statSrc(path.join(SRC, srcRel))).isFile();
    } catch {
        // 源里没有（例如已按「单连接器裁剪」删除），ZIP 里也不作要求
    }
    if (present) required.push(...zipRels);
}
const missing = required.filter((rel) => !entries.includes(rel));
if (missing.length > 0) {
    throw new Error(`ZIP 缺少必需条目：${missing.join(', ')}`);
}
const hasCli = entries.includes('com.doubao/cli.json');
const hasMcp = entries.includes('mcp.json');

console.log(`已生成 ${path.relative(process.cwd(), OUT)}`);
console.log(
    `  条目 ${result.entries} 个，原始 ${(result.rawBytes / 1024).toFixed(1)}KB，` +
        `压缩后 ${(result.zipBytes / 1024).toFixed(1)}KB`,
);
console.log(`  ZIP 根文件：${result.rootFiles.join(', ')}`);
console.log(
    `  连接器：MCP(${hasMcp ? 'mcp.json ✓' : 'mcp.json ✗'}) + CLI(${hasCli ? 'cli.json ✓' : 'cli.json ✗'})`,
);
console.log('  → 可直接在「插件 → 创建插件」上传该 ZIP');
