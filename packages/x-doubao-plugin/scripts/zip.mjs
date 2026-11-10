/**
 * 零依赖 ZIP 写入（只用 Node 内置 zlib）。
 *
 * 豆包两个上传入口要求不同的根结构，这里统一按「源目录 = ZIP 根」处理：
 *   - 插件包：源目录下必须有 plugin.json
 *   - 技能包：源目录下必须有 SKILL.md
 */
import { deflateRawSync, crc32 } from 'node:zlib';
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const DOS_TIME = 0;
// 固定为 2026-01-01 00:00，保证可复现构建
const DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1;

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

function localHeader({ name, deflated, crc, rawSize }) {
    const nameBuf = Buffer.from(name, 'utf8');
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0x0800, 6);
    header.writeUInt16LE(8, 8);
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
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(20, 6);
    header.writeUInt16LE(0x0800, 8);
    header.writeUInt16LE(8, 10);
    header.writeUInt16LE(DOS_TIME, 12);
    header.writeUInt16LE(DOS_DATE, 14);
    header.writeUInt32LE(crc, 16);
    header.writeUInt32LE(deflated.length, 20);
    header.writeUInt32LE(rawSize, 24);
    header.writeUInt16LE(nameBuf.length, 28);
    header.writeUInt16LE(0, 30);
    header.writeUInt16LE(0, 32);
    header.writeUInt16LE(0, 34);
    header.writeUInt16LE(0, 36);
    header.writeUInt32LE(0o644 << 16, 38);
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

/**
 * @param {string} srcDir 作为 ZIP 根目录的本地目录
 * @param {string} outFile 输出 zip 路径
 * @param {string} requiredRootFile 必须出现在 ZIP 根的文件名（plugin.json / SKILL.md）
 */
export async function writeZip(srcDir, outFile, requiredRootFile) {
    let info;
    try {
        info = await stat(path.join(srcDir, requiredRootFile));
    } catch {
        throw new Error(
            `未找到 ${path.join(srcDir, requiredRootFile)}：ZIP 根目录必须直接包含 ${requiredRootFile}`,
        );
    }
    if (!info.isFile()) throw new Error(`${requiredRootFile} 不是文件`);

    const files = await walk(srcDir);
    const locals = [];
    const centrals = [];
    let offset = 0;
    let rawTotal = 0;

    for (const file of files) {
        const raw = await readFile(file.full);
        rawTotal += raw.length;
        const deflated = deflateRawSync(raw, { level: 9 });
        const entry = {
            name: file.rel,
            deflated,
            crc: crc32(raw),
            rawSize: raw.length,
            offset,
        };
        const local = localHeader(entry);
        locals.push(local, deflated);
        centrals.push(centralHeader(entry));
        offset += local.length + deflated.length;
    }

    const cd = Buffer.concat(centrals);
    const zip = Buffer.concat([
        ...locals,
        cd,
        endOfCentralDirectory({
            count: files.length,
            cdSize: cd.length,
            cdOffset: offset,
        }),
    ]);

    await mkdir(path.dirname(outFile), { recursive: true });
    await writeFile(outFile, zip);

    return {
        entries: files.length,
        rawBytes: rawTotal,
        zipBytes: zip.length,
        rootFiles: files
            .filter((f) => !f.rel.includes('/'))
            .map((f) => f.rel),
    };
}
