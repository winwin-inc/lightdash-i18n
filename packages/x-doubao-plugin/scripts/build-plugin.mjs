#!/usr/bin/env node
/**
 * 把 ./plugin 打成可直接上传控制台的 ZIP（零依赖，只用 Node 内置 zlib）。
 *
 *   node scripts/build-plugin.mjs [输出文件，默认 dist/x-platform-assistant.zip]
 *
 * 关键：plugin.json 必须在 ZIP 根目录。多套一层目录是最高频的提交失败原因。
 */
import { deflateRawSync, crc32 } from 'node:zlib';
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = process.env.PLUGIN_SRC ?? path.join(HERE, '..', 'plugin');
const OUT = process.argv[2] ?? path.join(HERE, '..', 'dist', zipName());

function zipName() {
    return 'x-platform-assistant.zip';
}

async function walk(dir, baseDir = dir) {
    const out = [];
    for (const entry of await readdir(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            out.push(...(await walk(full, baseDir)));
        } else {
            out.push({
                full,
                rel: path.relative(baseDir, full).split(path.sep).join('/'),
            });
        }
    }
    return out.sort((a, b) => a.rel.localeCompare(b.rel));
}

/** DOS 时间：固定为 2026-01-01 00:00，保证可复现构建 */
const DOS_TIME = 0;
const DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1;

function localHeader({ name, deflated, crc, rawSize }) {
    const nameBuf = Buffer.from(name, 'utf8');
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4); // version needed
    header.writeUInt16LE(0x0800, 6); // UTF-8 flag
    header.writeUInt16LE(8, 8); // deflate
    header.writeUInt16LE(DOS_TIME, 10);
    header.writeUInt16LE(DOS_DATE, 12);
    header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(deflated.length, 18);
    header.writeUInt32LE(rawSize, 22);
    header.writeUInt16LE(nameBuf.length, 26);
    header.writeUInt16LE(0, 28);
    return Buffer.concat([header, nameBuf]);
}

function centralHeader({ name, deflated, crc, rawSize, offset }) {
    const nameBuf = Buffer.from(name, 'utf8');
    const header = Buffer.alloc(46);
    header.writeUInt32LE(0x02014b50, 0);
    header.writeUInt16LE(20, 4); // version made by
    header.writeUInt16LE(20, 6); // version needed
    header.writeUInt16LE(0x0800, 8);
    header.writeUInt16LE(8, 10);
    header.writeUInt16LE(DOS_TIME, 12);
    header.writeUInt16LE(DOS_DATE, 14);
    header.writeUInt32LE(crc, 16);
    header.writeUInt32LE(deflated.length, 20);
    header.writeUInt32LE(rawSize, 24);
    header.writeUInt16LE(nameBuf.length, 28);
    header.writeUInt16LE(0, 30); // extra
    header.writeUInt16LE(0, 32); // comment
    header.writeUInt16LE(0, 34); // disk
    header.writeUInt16LE(0, 36); // internal attrs
    header.writeUInt32LE(0o644 << 16, 38); // external attrs
    header.writeUInt32LE(offset, 42);
    return Buffer.concat([header, nameBuf]);
}

function endOfCentralDirectory({ count, cdSize, cdOffset }) {
    const buf = Buffer.alloc(22);
    buf.writeUInt32LE(0x06054b50, 0);
    buf.writeUInt16LE(0, 4);
    buf.writeUInt16LE(0, 6);
    buf.writeUInt16LE(count, 8);
    buf.writeUInt16LE(count, 10);
    buf.writeUInt32LE(cdSize, 12);
    buf.writeUInt32LE(cdOffset, 16);
    buf.writeUInt16LE(0, 20);
    return buf;
}

async function main() {
    let info;
    try {
        info = await stat(path.join(SRC, 'plugin.json'));
    } catch {
        throw new Error(`未找到 ${path.join(SRC, 'plugin.json')}：ZIP 根目录必须是插件根`);
    }
    if (!info.isFile()) throw new Error('plugin.json 不是文件');

    const files = await walk(SRC);
    const locals = [];
    const centrals = [];
    let offset = 0;
    let rawTotal = 0;

    for (const file of files) {
        const raw = await readFile(file.full);
        rawTotal += raw.length;
        const deflated = deflateRawSync(raw, { level: 9 });
        const crc = crc32(raw);
        const entry = {
            name: file.rel,
            deflated,
            crc,
            rawSize: raw.length,
            offset,
        };
        const local = localHeader(entry);
        locals.push(local, deflated);
        centrals.push(centralHeader(entry));
        offset += local.length + deflated.length;
    }

    const cd = Buffer.concat(centrals);
    const eocd = endOfCentralDirectory({
        count: files.length,
        cdSize: cd.length,
        cdOffset: offset,
    });
    const zip = Buffer.concat([...locals, cd, eocd]);

    await mkdir(path.dirname(OUT), { recursive: true });
    await writeFile(OUT, zip);

    const rawTotalOut = rawTotal + 0;
    console.log(`已生成 ${path.relative(process.cwd(), OUT)}`);
    console.log(`  条目 ${files.length} 个，原始 ${(rawTotalOut / 1024).toFixed(1)}KB，压缩后 ${(zip.length / 1024).toFixed(1)}KB`);
    console.log(`  根目录文件：${files.filter((f) => !f.rel.includes('/')).map((f) => f.rel).join(', ')}`);
}

await main();
