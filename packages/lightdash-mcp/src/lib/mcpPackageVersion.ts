import fs from 'node:fs';
import path from 'node:path';

let cached: string | null = null;

/**
 * 与 packages/lightdash-mcp/package.json 的 version 字段一致（构建产物在 dist/ 下时路径仍正确）。
 */
export function getMcpPackageVersion(): string {
    if (cached !== null) {
        return cached;
    }
    try {
        const pkgPath = path.join(__dirname, '..', '..', 'package.json');
        const raw = fs.readFileSync(pkgPath, 'utf8');
        const parsed = JSON.parse(raw) as { version?: unknown };
        const v =
            typeof parsed.version === 'string' && parsed.version.length > 0
                ? parsed.version
                : '0.0.0';
        cached = v;
        return v;
    } catch {
        cached = '0.0.0';
        return cached;
    }
}
