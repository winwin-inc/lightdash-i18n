#!/usr/bin/env node
/**
 * Lists MCP tool names registered via registerToolTyped(..., 'core-tool'|'tool-call', 'name', ...)
 * in packages/lightdash-mcp/src. Use to keep docs (e.g. packages/lightdash-skills/README) in sync.
 *
 * Usage:
 *   node scripts/list-mcp-tool-names.mjs
 *   node scripts/list-mcp-tool-names.mjs --write
 *
 * --write: updates packages/lightdash-mcp/DEV_TOOL_NAMES.md (committed optional).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '..');
const mcpSrc = path.join(repoRoot, 'packages', 'lightdash-mcp', 'src');

function extractToolNames(text) {
    const re =
        /registerToolTyped\(\s*[^,]+,\s*'(?:core-tool|tool-call)'\s*,\s*'([^']+)'/g;
    const out = [];
    let m;
    while ((m = re.exec(text)) !== null) out.push(m[1]);
    return out;
}

function walkTsFiles(dir, out = []) {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, ent.name);
        if (ent.isDirectory()) walkTsFiles(p, out);
        else if (ent.isFile() && ent.name.endsWith('.ts')) out.push(p);
    }
    return out;
}

function collectTools() {
    const names = [];
    const files = walkTsFiles(mcpSrc);
    for (const file of files) {
        if (file.endsWith(`${path.sep}registerToolTyped.ts`)) continue;
        const text = fs.readFileSync(file, 'utf8');
        names.push(...extractToolNames(text));
    }
    return [...new Set(names)].sort();
}

const tools = collectTools();
// Extension tools live in registerExtensionTools.ts
const extFile = path.join(mcpSrc, 'mcp', 'registerExtensionTools.ts');
const extNames = [];
if (fs.existsSync(extFile)) {
    const text = fs.readFileSync(extFile, 'utf8');
    extNames.push(...extractToolNames(text));
}

const extensionSet = new Set(extNames);
const coreTools = tools.filter((t) => !extensionSet.has(t));
const extensionTools = tools.filter((t) => extensionSet.has(t));

const lines = [];
lines.push('# MCP tool names');
lines.push('');
lines.push(
    `> 共 **${tools.length}** 个工具；与当前包内 MCP 注册一致。`,
);
lines.push('');
lines.push(`- Core-like count: **${coreTools.length}**`);
lines.push(`- Extension (site/chart helpers) count: **${extensionTools.length}**`);
lines.push('');
lines.push('## All tools (sorted)');
lines.push('');
for (const t of tools) {
    lines.push(`- \`${t}\``);
}
lines.push('');
lines.push('## Extension tools');
lines.push('');
for (const t of extensionTools) {
    lines.push(`- \`${t}\``);
}
lines.push('');
const body = lines.join('\n');

// eslint-disable-next-line no-console -- CLI output
console.log(body);

const write = process.argv.includes('--write');
if (write) {
    const outPath = path.join(
        repoRoot,
        'packages',
        'lightdash-mcp',
        'DEV_TOOL_NAMES.md',
    );
    fs.writeFileSync(outPath, body, 'utf8');
    process.stderr.write(`Wrote ${outPath}\n`);
}
